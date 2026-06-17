-- Migration: Add notification_email column to properties table
-- Allows homestays to configure a custom email address to receive chatbot notifications (e.g. booking requests, human help)

ALTER TABLE properties ADD COLUMN notification_email TEXT;
