# Probe Agent 探针代理

一个简单、跨平台、单二进制文件的代理程序，用于通过 WebSocket 监控和报告服务器指标。

该代理程序设计轻巧、易于部署。它作为一个命令行应用运行，负责收集系统统计信息（CPU、内存、磁盘、网络等）并发送到中央监控服务器。

## 功能特性

- **跨平台**: 可在 Linux、Windows 和 macOS 上编译和运行。
- **单一二进制文件**: 编译后无需任何外部依赖。
- **使用简单**: 通过简单的命令即可启动、停止和检查代理状态。
- **连接弹性**: 如果与服务器的连接丢失，会自动尝试重新连接。

## 下载

您可以从项目的发布页面（待添加链接）下载适用于您操作系统的最新预编译二进制文件。

- **Linux**: `probe-agent-linux`
- **Windows**: `probe-agent.exe`
- **macOS**: `probe-agent-darwin`

下载后，您可能需要为文件添加可执行权限。

**对于 Linux/macOS:**
```bash
chmod +x ./<二进制文件名>
```

## 从源码构建

如果您希望自行构建代理，需要先安装 Go 环境（版本 1.18 或更高）。

1.  **克隆仓库** (或下载源码):
    ```bash
    # git clone ... (仓库链接)
    cd monitoring_client
    ```

2.  **安装依赖**:
    本项目使用 Go Modules 管理依赖。在首次构建时，依赖项会自动下载。您也可以手动获取它们：
    ```bash
    go mod tidy
    ```

3.  **构建代理**:

    - **对于 Linux 或 macOS**:
      ```bash
      go build -o probe-agent probe.go
      ```
      这会创建一个名为 `probe-agent` 的可执行文件。

    - **对于 Windows**:
      ```bash
      go build -o probe-agent.exe probe.go
      ```
      这会创建一个名为 `probe-agent.exe` 的可执行文件。


## 如何使用

通过命令行参数来控制代理程序。

### 命令

**启动代理:**
```bash
./<二进制文件名> start [选项]
```

**示例:**
```bash
# Linux/macOS
./probe-agent start --addr "ws://monitoring.example.com:8080/probe" --id "server-01-uuid" --key "your-secret-key" --name "web-server-01"

# Windows
.\probe-agent.exe start --addr "ws://monitoring.example.com:8080/probe" --id "server-01-uuid" --key "your-secret-key" --name "web-server-01"
```

**检查代理状态:**
```bash
./<二进制文件名> status
```
*输出: `Probe agent is running.` (探针正在运行) 或 `Probe agent is stopped.` (探针已停止)*

**停止代理:**
```bash
./<二进制文件名> stop
```

**重启代理:**
```bash
./<二进制文件名> restart [选项]
```

### 命令行标志 (选项)

在使用 `start` 或 `restart` 命令时，以下为必需的标志。

| 标志         | 类型     | 描述                                                       | 是否必需 |
|--------------|----------|----------------------------------------------------------------|----------|
| `--addr`     | `string` | WebSocket 服务器地址 (例如, `ws://host:port/path`)             | **是**   |
| `--id`       | `string` | 此探针/服务器的唯一标识符。                                  | **是**   |
| `--key`      | `string` | 服务器要求的身份验证密钥。                                     | **是**   |
| `--name`     | `string` | 一个人类可读的服务器名称。 (默认值: `DefaultServer`)           | 否       |
| `--interval` | `duration` | 发送指标的时间间隔。 (例如, `15s`, `1m`) (默认值: `10s`)       | 否       |
