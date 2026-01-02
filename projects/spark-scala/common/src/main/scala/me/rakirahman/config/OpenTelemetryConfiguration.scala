package me.rakirahman.config

/** Telemetry configuration settings.
  *
  * @param url
  *   The telemetry endpoint URL.
  * @param audience
  *   The telemetry JWT audience scope.
  * @param isRelay
  *   Is the telemetry endpoint behind an Azure Relay.
  */
case class OpenTelemetryConfiguration(
    url: String = "",
    audience: String = "",
    isRelay: Boolean = false
)
