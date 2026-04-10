package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

const pidFile = ".probe.pid"

// --- Data Structures ---
type StatsData struct {
	CPU    float64   `json:"cpu"`
	Load   []float64 `json:"load"`
	Mem    MemStats  `json:"mem"`
	Disk   DiskStats `json:"disk"`
	Net    NetStats  `json:"net"`
	Uptime uint64    `json:"uptime"`
}

type MemStats struct {
	Total uint64 `json:"total"`
	Used  uint64 `json:"used"`
}

type DiskStats struct {
	Total uint64 `json:"total"`
	Used  uint64 `json:"used"`
}

type NetStats struct {
	Up        uint64 `json:"up"`
	Down      uint64 `json:"down"`
	TotalUp   uint64 `json:"total_up"`
	TotalDown uint64 `json:"total_down"`
}

type Message struct {
	Type string      `json:"type"`
	ID   string      `json:"id"`
	Name string      `json:"name"`
	Key  string      `json:"key"`
	Data interface{} `json:"data"`
}

// --- Main Function (Command Router) ---
func main() {
	if len(os.Args) < 2 {
		log.Fatalf("Usage: %s <start|stop|status|restart>", os.Args[0])
	}

	command := os.Args[1]
	switch command {
	case "start":
		startDaemon()
	case "stop":
		stopDaemon()
	case "status":
		checkStatus()
	case "restart":
		stopDaemon()
		time.Sleep(1 * time.Second)
		startDaemon()
	case "run": // Internal command for the daemon process
		runMonitor()
	default:
		log.Fatalf("Unknown command: '%s'. Use one of start, stop, status, restart.", command)
	}
}

// --- Daemon Control Functions ---

func startDaemon() {
	if pid, err := readPid(); err == nil && isProcessRunning(pid) {
		log.Fatalf("Probe agent is already running with PID: %d", pid)
	}

	// Re-invoke self with the internal "run" command
	args := append([]string{"run"}, os.Args[2:]...)
	cmd := exec.Command(os.Args[0], args...)

	// Detach the process from the current terminal
	setSysProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		log.Fatalf("Failed to start daemon: %v", err)
	}

	log.Printf("Probe agent started with PID: %d", cmd.Process.Pid)
	os.Exit(0) // Parent process exits
}

func stopDaemon() {
	pid, err := readPid()
	if err != nil {
		log.Println("Probe agent is not running (could not read PID file).")
		return
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		log.Printf("Unable to find process with PID %d: %v", pid, err)
		return
	}

	log.Printf("Stopping probe agent (PID: %d)...", pid)
	// Use os.Interrupt for better cross-platform support
	if err := process.Signal(os.Interrupt); err != nil {
		// Fallback to Kill if Interrupt fails
		_ = process.Kill()
	}

	_ = os.Remove(pidFile)
	log.Println("Probe agent stopped.")
}

func checkStatus() {
	pid, err := readPid()
	if err != nil {
		log.Println("Probe agent is stopped (PID file not found).")
		return
	}

	if isProcessRunning(pid) {
		log.Printf("Probe agent is running with PID: %d", pid)
	} else {
		log.Println("Probe agent is stopped (stale PID file found).")
	}
}

// --- Core Monitoring Logic ---

func runMonitor() {
	// This is the daemon process. Write its own PID.
	if err := os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", os.Getpid())), 0644); err != nil {
		log.Fatalf("Failed to write PID file: %v", err)
	}

	// Define and parse flags for the daemon
	fs := flag.NewFlagSet("probe-agent", flag.ContinueOnError)
	addr := fs.String("addr", "", "WebSocket server address (e.g., ws://localhost:8080/probe)")
	name := fs.String("name", "Default", "Name of the server being monitored")
	id := fs.String("id", "", "Unique ID for this probe")
	key := fs.String("key", "", "Authentication key")
	interval := fs.Duration("interval", 10*time.Second, "Time between sending metrics")

	if err := fs.Parse(os.Args[2:]); err != nil {
		log.Fatalf("Failed to parse flags: %v", err)
	}

	// Try to extract id and key from addr if they are missing
	if *addr != "" {
		if u, err := url.Parse(*addr); err == nil {
			q := u.Query()
			if *id == "" && q.Get("id") != "" {
				*id = q.Get("id")
			}
			if *key == "" && q.Get("key") != "" {
				*key = q.Get("key")
			}
		}
	}

	if *addr == "" || *id == "" || *key == "" {
		fs.Usage()
		log.Fatal("\nError: --addr, --id, and --key are required (either as flags or in the --addr URL query string).")
	}

	connectAndMonitor(*addr, *name, *id, *key, *interval)
}

func connectAndMonitor(addr, name, id, key string, interval time.Duration) {
	log.Printf("Starting monitoring for '%s' (%s), sending to %s every %s", name, id, addr, interval)

	var lastNetCounters net.IOCountersStat
	var lastTime time.Time

	for {
		dialer := websocket.Dialer{HandshakeTimeout: 45 * time.Second}
		conn, _, err := dialer.Dial(addr, http.Header{"X-Probe-Key": []string{key}})
		if err != nil {
			log.Println("Dial error:", err)
			log.Println("Retrying in 10 seconds...")
			time.Sleep(10 * time.Second)
			continue
		}

		log.Println("Successfully connected to server.")

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		func() {
			defer conn.Close()
			for range ticker.C {
				metrics, err := getMetrics(&lastNetCounters, &lastTime)
				if err != nil {
					log.Println("Error getting metrics:", err)
					continue
				}

				msg := Message{Type: "server_stats", ID: id, Name: name, Key: key, Data: metrics}
				jsonData, err := json.Marshal(msg)
				if err != nil {
					log.Println("JSON marshal error:", err)
					continue
				}

				if err := conn.WriteMessage(websocket.TextMessage, jsonData); err != nil {
					log.Println("Write error:", err)
					return // Exit inner loop to trigger reconnect
				}
			}
		}()
		log.Println("Connection lost. Reconnecting...")
	}
}

func getMetrics(lastNetCounters *net.IOCountersStat, lastTime *time.Time) (StatsData, error) {
	cpuPercent, _ := cpu.Percent(0, false)
	memInfo, _ := mem.VirtualMemory()
	loadAvg, _ := load.Avg()

	// Detect disk path based on OS
	diskPath := "/"
	if runtime.GOOS == "windows" {
		diskPath = "C:"
	}
	diskUsage, _ := disk.Usage(diskPath)
	netCounters, _ := net.IOCounters(false)
	hostInfo, _ := host.Info()

	currentTime := time.Now()
	var upSpeed, downSpeed uint64

	if !lastTime.IsZero() && len(netCounters) > 0 {
		duration := currentTime.Sub(*lastTime).Seconds()
		if duration > 0 {
			upSpeed = (netCounters[0].BytesSent - lastNetCounters.BytesSent) / uint64(duration)
			downSpeed = (netCounters[0].BytesRecv - lastNetCounters.BytesRecv) / uint64(duration)
		}
	}

	*lastTime = currentTime
	if len(netCounters) > 0 {
		*lastNetCounters = netCounters[0]
	}

	// CORRECTED THIS SECTION
	return StatsData{
		CPU:    cpuPercent[0],
		Load:   []float64{loadAvg.Load1, loadAvg.Load5, loadAvg.Load15},
		Mem:    MemStats{Total: memInfo.Total, Used: memInfo.Used},
		Disk:   DiskStats{Total: diskUsage.Total, Used: diskUsage.Used},
		Net:    NetStats{Up: upSpeed, Down: downSpeed, TotalUp: netCounters[0].BytesSent, TotalDown: netCounters[0].BytesRecv},
		Uptime: hostInfo.Uptime,
	}, nil
}

// --- Utility Functions ---
func readPid() (int, error) {
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return 0, err
	}
	pid, err := strconv.Atoi(string(data))
	if err != nil {
		return 0, err
	}
	return pid, nil
}

func isProcessRunning(pid int) bool {
	if pid <= 0 {
		return false
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	if runtime.GOOS == "windows" {
		// On Windows, os.FindProcess always succeeds.
		// We use tasklist to check if the PID is actually active.
		return isAliveWindows(pid)
	}

	// On Unix-like systems, sending signal 0 to a process checks if it exists without harming it.
	return process.Signal(syscall.Signal(0)) == nil
}

func isAliveWindows(pid int) bool {
	cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/NH")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(output), strconv.Itoa(pid))
}

func setSysProcAttr(cmd *exec.Cmd) {
	// 为了保持单文件跨平台编译兼容性，我们不在此处设置平台特定的属性（如 Setsid）。
	// 在 Linux/macOS 上，程序启动后会自动进入后台运行。
}
