# RPC Communication Plugin

Demonstrates RPC communication between Spark driver and executors using the plugin framework.

## Communication Types

- **Synchronous**: Executor sends message and waits for response using `pluginContext.ask()`
- **Asynchronous**: Fire-and-forget messaging using `pluginContext.send()`

Only executor plugins can initiate communication.

## Implementation

### Messages

All RPC messages must implement `Serializable`. This plugin defines request/response pairs for configuration exchange and status reporting.

### Synchronous Flow

1. Executor calls `pluginContext.ask()` during initialization to request configuration
2. Driver receives message in `receive()` method and responds with configuration value
3. Executor uses returned configuration for its operations

### Asynchronous Flow

1. Executor calls `pluginContext.send()` during shutdown to report final computed value
2. Driver receives message in `receive()` method and logs the result
3. Driver returns `Unit` to indicate no response expected

---

[All plugins](../README.md)
