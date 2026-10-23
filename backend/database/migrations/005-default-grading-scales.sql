-- Migration 005: every organization without a grading scale gets the CBSE 9-point scale as its default.
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 1;
INSERT INTO dbo.GradingScale (id, organizationId, name, bands, isDefault)
SELECT NEWID(), o.id, N'CBSE 9-point', N'[{"min":91,"max":100,"grade":"A1","point":10},{"min":81,"max":90,"grade":"A2","point":9},{"min":71,"max":80,"grade":"B1","point":8},{"min":61,"max":70,"grade":"B2","point":7},{"min":51,"max":60,"grade":"C1","point":6},{"min":41,"max":50,"grade":"C2","point":5},{"min":33,"max":40,"grade":"D","point":4},{"min":0,"max":32,"grade":"E","point":0,"remark":"Needs improvement"}]', 1
FROM dbo.Organization o
WHERE NOT EXISTS (SELECT 1 FROM dbo.GradingScale g WHERE g.organizationId = o.id);
PRINT CONCAT('grading scales added: ', @@ROWCOUNT);
EXEC sys.sp_set_session_context @key = N'is_platform_admin', @value = 0;
GO
