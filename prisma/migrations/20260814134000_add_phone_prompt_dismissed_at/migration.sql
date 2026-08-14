-- Sync phone reminder dismiss across devices (Google accounts).
ALTER TABLE `users`
  ADD COLUMN `phonePromptDismissedAt` DATETIME(0) NULL AFTER `phone`;
