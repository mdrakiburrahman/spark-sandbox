package me.rakirahman.lineage.diagram

/** Trait for generating lineage diagrams.
  */
trait LineageDiagramOperations {

  /** Generates a Mermaid diagram string for the lineage.
    *
    * @param diagramTitle
    *   The title for the diagram.
    * @param diagramOrientation
    *   The orientation of the diagram (LeftToRight or TopDown).
    * @return
    *   A Mermaid diagram string.
    */
  def getLineageAsMermaid(
      diagramTitle: String = "Table Lineage",
      diagramOrientation: DiagramOrientation.Orientation = DiagramOrientation.LeftToRight
  ): String
}
