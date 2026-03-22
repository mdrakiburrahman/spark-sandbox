import asyncio
import json
import logging
import sys

import click

from workspace_automation.__about__ import __version__


def setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )


def create_factory(config_path: str):
    """Create a ContainerizedManagementFactory from a config file."""
    from fabric_workspace_deployment.factories.management_factory import ContainerizedManagementFactory
    from fabric_workspace_deployment.operations.operation_interfaces import OperationParams

    operation_params = OperationParams(
        config_file_absolute_path=config_path,
        operation="dryRun",
        replace_placeholders=True,
    )
    return ContainerizedManagementFactory(operation_params)


async def _kill_pipeline(pipeline_client, run_client, workspace_id: str, pipeline_name: str) -> dict:
    """Kill all non-terminal runs of a named pipeline. Returns result dict."""
    logger = logging.getLogger(__name__)

    # Resolve pipeline by name
    pipeline = await pipeline_client.get_pipeline(workspace_id, pipeline_name)
    if pipeline is None:
        raise click.ClickException(f"Pipeline '{pipeline_name}' not found in workspace '{workspace_id}'")

    pipeline_id = pipeline.object_id
    logger.info(f"Found pipeline '{pipeline.display_name}' (id: {pipeline_id})")

    # List non-terminal runs
    runs = await run_client.list_non_terminal_runs(workspace_id, pipeline_id)
    if not runs:
        logger.info("No non-terminal runs found — nothing to cancel")
        return {
            "pipeline_name": pipeline.display_name,
            "pipeline_id": pipeline_id,
            "workspace_id": workspace_id,
            "cancelled": [],
            "failed": [],
            "total_found": 0,
        }

    logger.info(f"Found {len(runs)} non-terminal run(s) to cancel")

    cancelled = []
    failed = []

    for run in runs:
        run_id = run.artifact_job_instance_id
        logger.info(f"Cancelling run {run_id} (status: {run.status_string})")
        try:
            success = await run_client.cancel_run(workspace_id, pipeline_id, run_id)
            if success:
                cancelled.append({"run_id": run_id, "status": run.status_string})
                logger.info(f"Successfully cancelled run {run_id}")
            else:
                failed.append({"run_id": run_id, "status": run.status_string, "reason": "API returned non-202 status"})
                logger.warning(f"Failed to cancel run {run_id}")
        except Exception as e:
            failed.append({"run_id": run_id, "status": run.status_string, "reason": str(e)})
            logger.error(f"Error cancelling run {run_id}: {e}")

    return {
        "pipeline_name": pipeline.display_name,
        "pipeline_id": pipeline_id,
        "workspace_id": workspace_id,
        "cancelled": cancelled,
        "failed": failed,
        "total_found": len(runs),
    }


@click.group()
@click.version_option(version=__version__, prog_name="workspace-automation")
def cli():
    """Microsoft Fabric workspace automation CLI."""
    pass


@cli.command("kill-pipeline")
@click.option("--workspace-id", required=True, help="Fabric workspace object ID.")
@click.option("--pipeline-name", required=True, help="Display name of the pipeline to kill.")
@click.option("--config", required=True, type=click.Path(exists=True), help="Path to config JSON file.")
@click.option("--verbose", "-v", is_flag=True, default=False, help="Enable verbose logging.")
def kill_pipeline(workspace_id: str, pipeline_name: str, config: str, verbose: bool):
    """Kill all Not Started or Running instances of a named pipeline."""
    setup_logging(verbose)
    logger = logging.getLogger(__name__)

    try:
        factory = create_factory(config)
        pipeline_client = factory.create_fabric_pipeline_client()
        run_client = factory.create_fabric_pipeline_run_client()
        result = asyncio.run(_kill_pipeline(pipeline_client, run_client, workspace_id, pipeline_name))

        click.echo(json.dumps(result, indent=2))

        if result["failed"]:
            sys.exit(1)

    except click.ClickException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise click.ClickException(str(e))


def main():
    cli()


if __name__ == "__main__":
    main()
