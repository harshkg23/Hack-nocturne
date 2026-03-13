# SentinelQA — Auto-Generated Test Plan

> Generated on 2026-03-13T20:23:35.467Z

## Scenario: Dashboard loads successfully
1. Navigate to /dashboard
2. Assert page contains "Welcome to your dashboard"
3. Assert page contains "Recent Activity"
4. Assert page contains "Settings"

## Scenario: User profile updates
1. Navigate to /dashboard
2. Click "Profile"
3. Type "John Doe" into "Name"
4. Type "john.doe@example.com" into "Email"
5. Click "Save Changes"
6. Assert page contains "Profile updated successfully"
