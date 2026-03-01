package me.rakirahman.quality.maintenance.manager

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class TableMaintenanceManagerTest extends AnyFunSpec with Matchers {

  describe("TableMaintenanceManager") {

    it("should be implementable with a custom type") {
      import scala.collection.mutable.ListBuffer

      val manager = new TableMaintenanceManager[ListBuffer, String] {
        def executeMaintenance(scripts: ListBuffer[String]): Boolean = {
          scripts.nonEmpty
        }
      }
      manager.executeMaintenance(ListBuffer("script1")) shouldBe true
      manager.executeMaintenance(ListBuffer.empty) shouldBe false
    }
  }
}
