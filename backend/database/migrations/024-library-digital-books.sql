ALTER TABLE dbo.Book ADD
  [pdfFileName] NVARCHAR(260) NULL,
  [pdfSizeBytes] INT NULL,
  [pdfContent] VARBINARY(MAX) NULL;
GO
