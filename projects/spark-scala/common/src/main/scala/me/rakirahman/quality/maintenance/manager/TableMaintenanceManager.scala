package me.rakirahman.quality.maintenance.manager

/** Trait representing a table maintenance manager.
  *
  * @tparam L
  *   the type of the container for scripts
  * @tparam SC
  *   the type of the script
  */
trait TableMaintenanceManager[L[_], SC] {

  /** Executes the maintenance scripts.
    *
    * @param scripts
    *   the container of scripts to be executed
    * @return
    *   true if the maintenance was successful, false otherwise
    */
  def executeMaintenance(scripts: L[SC]): Boolean
}
