# MonsterBox API Documentation

## Overview

The MonsterBox API provides comprehensive control over animatronic characters, hardware components, and system monitoring. This RESTful API supports JSON requests and responses with proper authentication and rate limiting.

**Base URL**: `http://localhost:3000`  
**API Version**: 1.0  
**Authentication**: JWT Bearer tokens for protected endpoints

## Authentication

### JWT Authentication
Protected endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Getting a Token
```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "admin-001",
    "username": "admin",
    "role": "admin"
  }
}
```

## Rate Limiting

The API implements multiple rate limiting tiers:

- **General**: 1000 requests per 15 minutes per IP
- **API Endpoints**: 500 requests per 15 minutes per IP  
- **Monitoring**: 60 requests per minute per IP
- **Cache Management**: 10 requests per 15 minutes per IP

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Time when the rate limit resets

## Response Format

All API responses follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-06-16T02:30:00.000Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-06-16T02:30:00.000Z",
  "path": "/api/endpoint",
  "method": "POST"
}
```

## Core API Endpoints

### Characters API

#### Get All Characters
```http
GET /api/characters
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Orlok"
    },
    {
      "id": 4,
      "name": "Skulltalker"
    }
  ]
}
```

**Caching**: 10 minutes TTL  
**Rate Limit**: API tier (500/15min)

#### Get Character Details
```http
GET /characters/:id
```

#### Update Character
```http
PUT /characters/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "char_name": "Updated Name",
  "description": "Character description"
}
```

### Hardware API

#### Get Hardware Status
```http
GET /api/hardware/status
Authorization: Bearer <token>
```

#### Control Hardware Component
```http
POST /api/hardware/:type/:id/control
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "move",
  "parameters": {
    "position": 90,
    "speed": 50
  }
}
```

### Connection Monitoring

#### Get Connection Status
```http
GET /api/connections/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "services": {
      "jawAnimation": {
        "state": "connected",
        "health": true,
        "details": {
          "healthy": true,
          "readyState": "OPEN"
        }
      }
    },
    "statistics": {
      "pool": {
        "totalConnections": 5,
        "healthyConnections": 5
      }
    }
  }
}
```

**Rate Limit**: Monitoring tier (60/min)

### Cache Management

#### Get Cache Statistics
```http
GET /api/cache/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "entries": 25,
    "maxSize": 1000,
    "totalSize": 15420,
    "hitRate": 85.5,
    "metrics": {
      "hits": 342,
      "misses": 58,
      "sets": 25,
      "deletes": 2
    }
  }
}
```

#### Clear Cache
```http
POST /api/cache/clear
Content-Type: application/json

{
  "pattern": "GET:/api/characters:"
}
```

**Rate Limit**: Cache management tier (10/15min)

### ChatterPi API

#### Send Chat Message
```http
POST /api/chatterpi/chat
Content-Type: application/json

{
  "message": "Hello there!",
  "character": "orlok"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userMessage": "Hello there!",
    "aiResponse": {
      "text": "Greetings, mortal...",
      "character": "orlok",
      "metadata": {
        "model": "gpt-4",
        "tokens": 25
      }
    },
    "jawAnimation": {
      "enabled": true,
      "duration": 2500
    }
  }
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Authentication token required |
| `INVALID_TOKEN` | Invalid or expired token |
| `PERMISSION_DENIED` | Insufficient permissions |
| `VALIDATION_ERROR` | Request validation failed |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| `RESOURCE_NOT_FOUND` | Requested resource not found |
| `HARDWARE_ERROR` | Hardware operation failed |
| `CONNECTION_ERROR` | Service connection failed |

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `429` - Too Many Requests
- `500` - Internal Server Error
- `503` - Service Unavailable

## WebSocket Connections

### Jaw Animation WebSocket
**URL**: `ws://localhost:8765`

**Message Format:**
```json
{
  "type": "jaw_position",
  "character": "orlok",
  "position": 45,
  "duration": 100
}
```

### Hardware WebSocket
**URL**: `ws://localhost:8780`

**Message Format:**
```json
{
  "type": "hardware_command",
  "device": "servo_1",
  "action": "move",
  "parameters": {
    "position": 90,
    "speed": 50
  }
}
```

## SDK Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

class MonsterBoxAPI {
  constructor(baseURL, token) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getCharacters() {
    const response = await this.client.get('/api/characters');
    return response.data;
  }

  async sendChatMessage(message, character = 'orlok') {
    const response = await this.client.post('/api/chatterpi/chat', {
      message,
      character
    });
    return response.data;
  }
}

// Usage
const api = new MonsterBoxAPI('http://localhost:3000', 'your-token');
const characters = await api.getCharacters();
```

### Python
```python
import requests

class MonsterBoxAPI:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    
    def get_characters(self):
        response = requests.get(
            f'{self.base_url}/api/characters',
            headers=self.headers
        )
        return response.json()
    
    def send_chat_message(self, message, character='orlok'):
        response = requests.post(
            f'{self.base_url}/api/chatterpi/chat',
            json={'message': message, 'character': character},
            headers=self.headers
        )
        return response.json()

# Usage
api = MonsterBoxAPI('http://localhost:3000', 'your-token')
characters = api.get_characters()
```

## Testing

### Health Check
```http
GET /health
```

### API Test Endpoint
```http
GET /api/test
```

For comprehensive testing, see the test suite in `/tests/` directory.
