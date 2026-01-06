# Compact Header Usage Guide

## Overview
The compact header provides a consistent, space-efficient navigation header for all MonsterBox pages. It replaces the old bulky navigation that took up 6+ lines with a clean 2-line header.

**Note**: Currently using inline header implementation due to EJS partial compatibility issues. The partial approach is available for future use once EJS parsing issues are resolved.

## Features
- **Compact Design**: Only 2 lines instead of 6+ lines
- **Consistent Styling**: Matches MonsterBox's spooky neon theme
- **Responsive**: Adapts to mobile screens
- **Breadcrumb Navigation**: Clear navigation hierarchy
- **Reusable**: Single partial for all pages

## Usage

### Current Implementation (Inline)
```html
<header class="compact-header">
    <div class="header-content">
        <h1 class="page-title">🧠 Page Title</h1>
        <nav class="compact-nav">
            <a href="/" class="nav-link">🏠 Home</a>
            <span class="nav-separator">•</span>
            <span class="nav-current">Current Page</span>
        </nav>
    </div>
</header>
```

### Future Partial Usage (When EJS Issues Resolved)
```ejs
<%- include('../partials/compact-header', {
    title: 'Page Title',
    icon: '🧠',
    breadcrumbs: [
        { name: 'Home', url: '/', icon: '🏠' },
        { name: 'Current Page', current: true }
    ]
}) %>
```

### Advanced Usage with Multiple Breadcrumbs
```ejs
<%- include('../partials/compact-header', { 
    title: 'AI Personalities Configuration', 
    icon: '🧠', 
    breadcrumbs: [
        { name: 'Home', url: '/', icon: '🏠' },
        { name: 'AI Management', url: '/ai-management', icon: '🧠' },
        { name: 'AI Personalities', current: true }
    ]
}) %>
```

## Parameters

### Required Parameters
- **title**: The main page title (string)
- **icon**: Emoji icon for the page (string)
- **breadcrumbs**: Array of breadcrumb objects

### Breadcrumb Object Structure
```javascript
{
    name: 'Display Name',     // Required: Text to display
    url: '/path/to/page',     // Optional: URL (omit for current page)
    icon: '🏠',              // Optional: Emoji icon
    current: true            // Optional: Mark as current page (no link)
}
```

## Examples

### Characters Page
```ejs
<%- include('../partials/compact-header', { 
    title: 'Character Management', 
    icon: '🎭', 
    breadcrumbs: [
        { name: 'Home', url: '/', icon: '🏠' },
        { name: 'Characters', current: true }
    ]
}) %>
```

### Hardware Parts Page
```ejs
<%- include('../partials/compact-header', { 
    title: 'Hardware Parts', 
    icon: '🔧', 
    breadcrumbs: [
        { name: 'Home', url: '/', icon: '🏠' },
        { name: 'Hardware Parts', current: true }
    ]
}) %>
```

### Configuration Subpage
```ejs
<%- include('../partials/compact-header', { 
    title: 'System Configuration', 
    icon: '⚙️', 
    breadcrumbs: [
        { name: 'Home', url: '/', icon: '🏠' },
        { name: 'Configuration', url: '/configuration', icon: '⚙️' },
        { name: 'System Settings', current: true }
    ]
}) %>
```

## Styling
The compact header includes its own CSS styles and doesn't require additional styling. It automatically:
- Uses the Creepster font for titles
- Applies MonsterBox's neon green theme
- Provides hover effects for links
- Adapts to mobile screens

## Migration from Old Headers
Replace old header blocks like this:
```ejs
<!-- OLD -->
<header>
    <h1>🧠 AI Personalities Configuration</h1>
    <nav class="breadcrumb">
        <a href="/">Home</a> &gt; 
        <a href="/ai-management">AI Management</a> &gt; 
        <span>AI Personalities</span>
    </nav>
</header>

<!-- NEW -->
<%- include('../partials/compact-header', { 
    title: 'AI Personalities Configuration', 
    icon: '🧠', 
    breadcrumbs: [
        { name: 'Home', url: '/', icon: '🏠' },
        { name: 'AI Management', url: '/ai-management', icon: '🧠' },
        { name: 'AI Personalities', current: true }
    ]
}) %>
```

## Benefits
1. **Space Efficient**: Reduces header from 6+ lines to 2 lines
2. **Consistent**: Same look and feel across all pages
3. **Maintainable**: Single file to update for header changes
4. **Accessible**: Proper navigation hierarchy
5. **Mobile Friendly**: Responsive design
