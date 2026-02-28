package me.rakirahman.lineage.diagram

/** Enumeration defining the different types of diagram orientations.
  */
object DiagramOrientation extends Enumeration {
  type Orientation = Value
  val LeftToRight: Orientation = Value("LR")
  val TopDown: Orientation = Value("TD")
}

// @formatter:off
/** Enumeration defining hex color constants for Mermaid diagram styling.
  */
object HexColors extends Enumeration {
  type Color = Value

  val GreenLight: Color  = Value("#ccffcc")
  val Green: Color       = Value("#66cc66")

  val RedLight: Color    = Value("#ffcccc")
  val Red: Color         = Value("#ff6666")

  val YellowLight: Color = Value("#ffffcc")
  val Yellow: Color      = Value("#cccc66")

  val GrayLight: Color   = Value("#e8e8e8")
  val Gray: Color        = Value("#999999")
}
// @formatter:on
