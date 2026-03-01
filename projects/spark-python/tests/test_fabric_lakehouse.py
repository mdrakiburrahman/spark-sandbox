import pyodbc
import pytest

WORKSPACE_ID = "3ea60ae5-e979-4d31-a317-66491ab497fb"
LAKEHOUSE_ID = "4d8783be-e822-46d0-82e4-9b77c7f33992"


def test_fabric_lakehouse_select_one():
    """Verify basic connectivity to Microsoft Fabric Lakehouse via ODBC."""
    conn = pyodbc.connect(
        "DRIVER={Microsoft ODBC Driver for Microsoft Fabric Data Engineering};" f"WorkspaceId={WORKSPACE_ID};" f"LakehouseId={LAKEHOUSE_ID};" "AuthFlow=AZURE_CLI;",
        timeout=30,
    )
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        row = cursor.fetchone()
        assert row[0] == 1
    finally:
        conn.close()
