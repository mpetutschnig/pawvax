# 11 - Scalability & Performance Standards

## Backend Performance
1. **Database Indexing**: Every foreign key and frequently searched field (e.g., `microchip_id`) MUST have an index.
2. **Connection Pooling**: Use PG pool to handle high concurrent traffic.
3. **Asynchronous Processing**: Heavy tasks (like Image resizing or AI calls) must not block the main event loop.

## Frontend Performance
1. **Code Splitting**: Use `React.lazy` for page-level components to reduce initial bundle size.
2. **Image Optimization**: Auto-resize images on the client side before uploading to save bandwidth and storage.
3. **Memoization**: Use `useMemo` and `useCallback` for expensive calculations in the vaccination timeline.

## Infrastructure Scaling
- **MVP Statefulness**: The backend currently relies on local volumes (`/uploads`) for file storage.
- **Future Horizontal Scaling**: True statelessness will be achieved by migrating file storage to an S3-compatible service (Auth is already stateless via JWT).
- Static assets served via CDN or optimized Nginx caching.
