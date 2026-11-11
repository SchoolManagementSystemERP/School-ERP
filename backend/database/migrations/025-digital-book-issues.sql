ALTER TABLE dbo.BookLoan
  ADD [isDigital] BIT NOT NULL CONSTRAINT [BookLoan_isDigital_df] DEFAULT 0;
GO
