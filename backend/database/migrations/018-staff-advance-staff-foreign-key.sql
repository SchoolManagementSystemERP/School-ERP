IF OBJECT_ID(N'dbo.FK_StaffAdvance_staffId', N'F') IS NULL
  ALTER TABLE dbo.StaffAdvance WITH CHECK
  ADD CONSTRAINT FK_StaffAdvance_staffId FOREIGN KEY (staffId) REFERENCES dbo.Staff(id);
