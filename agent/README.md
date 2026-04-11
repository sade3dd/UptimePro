# Probe Agent

A simple, cross-platform, single-binary agent for monitoring and reporting server metrics via WebSocket.

This agent is designed to be lightweight and easy to deploy. It runs as a command-line application, collects system statistics (CPU, Memory, Disk, Network, etc.), and sends them to a central monitoring server.

## Features

- **Cross-Platform**: Compiles and runs on Linux, Windows, and macOS.
- **Single Binary**: No external dependencies needed after compilation.
- **Easy to Use**: Simple commands to start, stop, and check the agent's status.
- **Resilient**: Automatically attempts to reconnect to the server if the connection is lost.

## Download

You can download the latest pre-compiled binaries for your operating system from the releases page (link to be added).

- **Linux**: `probe-agent-linux`
- **Windows**: `probe-agent.exe`
- **macOS**: `probe-agent-darwin`

After downloading, you may need to make the file executable.

**For Linux/macOS:**
```bash
chmod +x ./<binary-name>
```

## Building from Source

If you prefer to build the agent yourself, you will need to have Go (version 1.18 or newer) installed.

1.  **Clone the Repository** (or download the source code):
    ```bash
    # git clone ... (repository link)
    cd monitoring_client
    ```

2.  **Install Dependencies**:
    The project uses Go Modules. Dependencies will be downloaded automatically on the first build. You can also fetch them manually:
    ```bash
    go mod tidy
    ```

3.  **Build the Agent**:

    - **For Linux or macOS**:
      ```bash
      go build -o probe-agent probe.go
      ```
      This will create an executable file named `probe-agent`.

    - **For Windows**:
      ```bash
      go build -o probe-agent.exe probe.go
      ```
      This will create an executable file named `probe-agent.exe`.


## Usage

The agent is controlled via command-line arguments.

### Commands

**Start the agent:**
```bash
./<binary-name> start [options]
```

**Example:**
```bash
# For Linux/macOS
./probe-agent start --addr "ws://monitoring.example.com:8080/probe" --id "server-01-uuid" --key "your-secret-key" --name "web-server-01"

# For Windows
.\probe-agent.exe start --addr "ws://monitoring.example.com:8080/probe" --id "server-01-uuid" --key "your-secret-key" --name "web-server-01"
```

**Check the agent's status:**
```bash
./<binary-name> status
```
*Output: `Probe agent is running.` or `Probe agent is stopped.`*

**Stop the agent:**
```bash
./<binary-name> stop
```

**Restart the agent:**
```bash
./<binary-name> restart [options]
```

### Command-Line Flags (Options)

These flags are required for the `start` and `restart` commands.

| Flag         | Type     | Description                                                  | Required |
|--------------|----------|--------------------------------------------------------------|----------|
| `--addr`     | `string` | The WebSocket server address. (e.g., `ws://host:port/path`)  | **Yes**  |
| `--id`       | `string` | A unique identifier for this specific agent/server.          | **Yes**  |
| `--key`      | `string` | The authentication key required by the server.               | **Yes**  |
| `--name`     | `string` | A human-readable name for the server. (Default: `DefaultServer`) | No       |
| `--interval` | `duration` | The time interval for sending metrics. (e.g., `15s`, `1m`) (Default: `10s`) | No       |
