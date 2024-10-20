A really optimized and simple replit authentication middleware for Express. The middleware can be applied to all routes or specific routes, and a custom login page can be used.
## Installation
```
npm install replit-auth
```
## Usage
```js
const express = require('express');
const authMiddleware = require('replit-auth');

const app = express();

// Apply the middleware to all routes
authMiddleware(app);

// Apply the middleware to specific routes
const auth = authMiddleware(app, { allRoutes: false });
app.get('/protected', auth, (req, res) => {
  res.send(`Hello, ${req.user.name}!`);
});

// Use a custom login page
authMiddleware(app, { customPage: '/path/to/custom/login.html' });
```
## API

### `authMiddleware(app, options)`

This function takes in an Express application instance and an options object.

#### Parameters

- `app` (Express application instance): The Express application instance to which the middleware will be applied.
- `options` (Object): An object containing optional parameters.
  - `allRoutes` (Boolean): Whether auth should be applied on all routes or not. Defaults to `true`.
  - `customPage` (String): Path to custom auth page file.

#### Returns

If `allRoutes` is false, returns an auth middleware function that can be used on specific routes. If `allRoutes` is true, returns `undefined`.

### Type for req.user:
```ts
interface UserInfo {
  id?: number;
  name?: string;
  bio?: string;
  url?: string;
  profileImage?: string;
  roles?: string[];
  teams?: string[];
	[prop: string]: any;
}
```