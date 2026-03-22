import asyncio
from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import click
import pytest

from workspace_automation.cli import _kill_pipeline


@dataclass
class MockPipeline:
    id: str
    object_id: str
    display_name: str


@dataclass
class MockPipelineRun:
    artifact_job_instance_id: str
    status: int
    status_string: str


class TestKillPipeline:
    """Tests for the _kill_pipeline async function."""

    @pytest.fixture
    def mock_pipeline_client(self):
        client = MagicMock()
        client.get_pipeline = AsyncMock()
        return client

    @pytest.fixture
    def mock_run_client(self):
        client = MagicMock()
        client.list_non_terminal_runs = AsyncMock()
        client.cancel_run = AsyncMock()
        return client

    def test_pipeline_not_found(self, mock_pipeline_client, mock_run_client):
        """Should raise ClickException when pipeline name doesn't resolve."""
        mock_pipeline_client.get_pipeline.return_value = None

        with pytest.raises(click.ClickException, match="not found"):
            asyncio.run(_kill_pipeline(mock_pipeline_client, mock_run_client, "ws-123", "nonexistent-pipeline"))

        mock_pipeline_client.get_pipeline.assert_awaited_once_with("ws-123", "nonexistent-pipeline")

    def test_no_runs_to_cancel(self, mock_pipeline_client, mock_run_client):
        """Should return empty cancelled list when no non-terminal runs exist."""
        mock_pipeline_client.get_pipeline.return_value = MockPipeline(id="pipe-1", object_id="pipe-obj-1", display_name="my-pipeline")
        mock_run_client.list_non_terminal_runs.return_value = []

        result = asyncio.run(_kill_pipeline(mock_pipeline_client, mock_run_client, "ws-123", "my-pipeline"))

        assert result["pipeline_name"] == "my-pipeline"
        assert result["pipeline_id"] == "pipe-obj-1"
        assert result["total_found"] == 0
        assert result["cancelled"] == []
        assert result["failed"] == []
        mock_run_client.cancel_run.assert_not_awaited()

    def test_cancels_all_runs(self, mock_pipeline_client, mock_run_client):
        """Should cancel all non-terminal runs and report results."""
        mock_pipeline_client.get_pipeline.return_value = MockPipeline(id="pipe-1", object_id="pipe-obj-1", display_name="my-pipeline")
        mock_run_client.list_non_terminal_runs.return_value = [
            MockPipelineRun(artifact_job_instance_id="run-1", status=0, status_string="Not Started"),
            MockPipelineRun(artifact_job_instance_id="run-2", status=1, status_string="In Progress"),
        ]
        mock_run_client.cancel_run.return_value = True

        result = asyncio.run(_kill_pipeline(mock_pipeline_client, mock_run_client, "ws-123", "my-pipeline"))

        assert result["total_found"] == 2
        assert len(result["cancelled"]) == 2
        assert result["cancelled"][0]["run_id"] == "run-1"
        assert result["cancelled"][1]["run_id"] == "run-2"
        assert result["failed"] == []
        assert mock_run_client.cancel_run.await_count == 2

    def test_partial_failure(self, mock_pipeline_client, mock_run_client):
        """Should report both cancelled and failed runs when some cancellations fail."""
        mock_pipeline_client.get_pipeline.return_value = MockPipeline(id="pipe-1", object_id="pipe-obj-1", display_name="my-pipeline")
        mock_run_client.list_non_terminal_runs.return_value = [
            MockPipelineRun(artifact_job_instance_id="run-1", status=0, status_string="Not Started"),
            MockPipelineRun(artifact_job_instance_id="run-2", status=1, status_string="In Progress"),
        ]
        mock_run_client.cancel_run.side_effect = [True, False]

        result = asyncio.run(_kill_pipeline(mock_pipeline_client, mock_run_client, "ws-123", "my-pipeline"))

        assert result["total_found"] == 2
        assert len(result["cancelled"]) == 1
        assert len(result["failed"]) == 1
        assert result["cancelled"][0]["run_id"] == "run-1"
        assert result["failed"][0]["run_id"] == "run-2"

    def test_cancel_exception(self, mock_pipeline_client, mock_run_client):
        """Should handle exceptions during cancellation gracefully."""
        mock_pipeline_client.get_pipeline.return_value = MockPipeline(id="pipe-1", object_id="pipe-obj-1", display_name="my-pipeline")
        mock_run_client.list_non_terminal_runs.return_value = [
            MockPipelineRun(artifact_job_instance_id="run-1", status=1, status_string="In Progress"),
        ]
        mock_run_client.cancel_run.side_effect = RuntimeError("API timeout")

        result = asyncio.run(_kill_pipeline(mock_pipeline_client, mock_run_client, "ws-123", "my-pipeline"))

        assert result["total_found"] == 1
        assert len(result["cancelled"]) == 0
        assert len(result["failed"]) == 1
        assert "API timeout" in result["failed"][0]["reason"]
