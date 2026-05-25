"""Integration factory: returns mock or real client based on env vars.

SUPPLIER_USE_MOCK -> SAP S/4 HANA
MES_USE_MOCK      -> Manufacturing Execution System
CMMS_USE_MOCK     -> Maintenance work orders

Mock and real clients are byte-identical in interface. Never diverge.
"""
