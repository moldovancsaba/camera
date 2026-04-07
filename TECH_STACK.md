# TECH_STACK.md

**Project**: Camera — Photo Frame Webapp  
**Current Version**: 1.7.1  
**Last Updated**: 2025-11-06T19:05:13.000Z

Complete technology stack documentation with rationale for every technical decision.

---

## Core Technologies

### Next.js 16.0.1
**Type**: Full-stack React framework  
**Why Chosen**:
- Server-side rendering improves SEO and initial load performance
- API routes eliminate need for separate backend
- File-based routing reduces boilerplate
- Built-in optimizations (code splitting, image optimization)
- Excellent TypeScript support
- App Router provides modern React patterns (Server Components)

**Alternatives Considered**:
- Create React App: No SSR, no API routes
- Remix: Less mature ecosystem
- Pure Node.js + React: More setup required

**Configuration**:
```javascript
// next.config.ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  /* config options here */
};
export default nextConfig;
```

---

### TypeScript 5.9.3
**Type**: Programming language (superset of JavaScript)  
**Why Chosen**:
- Catches type errors at compile time before runtime
- Better IDE autocomplete and refactoring support
- Self-documenting code through types
- Reduces bugs in large codebases
- Industry standard for professional applications

**Configuration**: Strict mode enabled
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

**Alternatives Considered**:
- JavaScript: No type safety
- Flow: Less community support

---

### React 19.2.0
**Type**: UI library  
**Why Chosen**:
- Component-based architecture promotes reusability
- Huge ecosystem of libraries and tools
- Team familiarity and industry adoption
- Virtual DOM for performance
- Hooks provide clean state management

**Patterns Used**:
- Functional components (no class components)
- Custom hooks for reusable logic
- Server Components for data fetching
- Client Components for interactivity ('use client')

**Alternatives Considered**:
- Vue: Smaller ecosystem
- Svelte: Less mature, smaller team
- Angular: More complex, opinionated

---

### Tailwind CSS 4.0
**Type**: Utility-first CSS framework  
**Why Chosen**:
- No CSS file bloat (unused styles purged)
- Consistent design system via utility classes
- Dark mode support out of the box
- Responsive design with breakpoint prefixes
- No naming conflicts (no BEM, no CSS Modules needed)
- Fast iteration (no switching between files)

**Configuration**:
```css
@import "tailwindcss";
```

**Design Tokens**:
- Primary: blue-600 (`#2563eb`)
- Spacing scale: 4px base (0.25rem)
- Border radius: rounded-lg (8px)

**Alternatives Considered**:
- CSS Modules: More verbose
- Styled Components: Runtime cost
- Bootstrap: Opinionated components

---

## Database & Backend

### MongoDB 6.8.0 (Atlas)
**Type**: NoSQL document database  
**Why Chosen**:
- Flexible schema fits dynamic data (events, frames, submissions)
- JSON-like documents match JavaScript objects naturally
- Excellent Node.js driver support
- Atlas provides managed hosting (no ops overhead)
- Horizontal scaling capability
- Rich query language with aggregation pipeline

**Connection Pattern**: Singleton with connection pooling
```typescript
// lib/db/mongodb.ts
maxPoolSize: 10,  // Reuse connections
minPoolSize: 2,   // Keep warm connections
```

**Collections**:
1. `partners` - Organizations/brands
2. `events` - Event instances
3. `frames` - Frame templates
4. `submissions` - User photo submissions
5. `slideshows` - Slideshow configurations
6. `users_cache` - Optional SSO user cache

**Alternatives Considered**:
- PostgreSQL: Too rigid for MVP, more complex schema changes
- MySQL: Same issues as PostgreSQL
- DynamoDB: AWS lock-in, less flexible queries
- Firebase: Not suitable for complex queries

---

## Authentication & Authorization

### Custom SSO Integration (OAuth2/OIDC)
**Type**: External authentication service  
**Why Chosen**:
- Centralized authentication across all projects
- OAuth2 industry standard protocol
- PKCE flow secure for public clients
- Already operational (sso.doneisbetter.com v5.16.0)
- Supports role-based access control
- 30-day sessions with token rotation

**Protocol**: OAuth2 with PKCE (Proof Key for Code Exchange)  
**Session Storage**: HTTP-only cookies  
**Token Management**: Access token (1 hour) + Refresh token (30 days)

**Security Features**:
- HTTP-only cookies (XSS protection)
- SameSite=Lax (CSRF protection)
- Secure flag in production (HTTPS only)
- Token rotation on refresh
- State parameter validation

**Alternatives Considered**:
- NextAuth.js: Requires self-hosting providers
- Auth0: Expensive, external dependency
- Firebase Auth: Platform lock-in
- Custom JWT: More work, less secure

---

## External Services

### imgbb.com
**Type**: Image CDN/hosting  
**Why Chosen**:
- Simple API (base64 upload)
- Free tier with generous limits (32MB per image)
- No S3 configuration complexity
- Permanent URLs (no expiration)
- Fast CDN delivery
- No storage management needed

**API Pattern**:
```typescript
// Upload base64 image
const response = await uploadImage(base64Data, { name: 'photo' });
// Use response.data.data.url (not display_url or thumb.url)
```

**Alternatives Considered**:
- AWS S3: Complex setup, bucket policies, IAM
- Cloudinary: More expensive
- Vercel Blob Storage: Newer, less proven

---

### Transactional email
**Current state**: Not integrated in this app’s API routes. SSO handles login only; outbound product email would use a separate provider (e.g. Resend) if added later. See `docs/AUTHORIZATION.md`.

---

### Axios 1.7.0
**Type**: HTTP client  
**Why Chosen**:
- Promise-based API
- Request/response interceptors
- Automatic JSON transformation
- Browser and Node.js support
- Better error handling than fetch
- TypeScript definitions included

**Usage**: External API calls (SSO, imgbb)

**Alternatives Considered**:
- Fetch API: Less features, no interceptors
- Got: Node.js only
- Request: Deprecated

---

## Development Tools

### ESLint 9
**Type**: Code linter  
**Why Chosen**:
- Catches bugs and code quality issues
- Enforces consistent code style
- Next.js-specific rules available
- TypeScript support
- Customizable rules

**Configuration**: `eslint-config-next` (Next.js recommended rules)

---

### TypeScript Compiler
**Type**: Type checker  
**Usage**: `npm run type-check` → `tsc --noEmit`  
**Why**: Catch type errors before runtime, separate from build process

---

## Package Manager

### npm (≥8.0.0)
**Type**: Package manager  
**Why Chosen**:
- Built into Node.js
- Lockfile (package-lock.json) for reproducible builds
- Workspace support if needed
- Industry standard

**Alternatives Considered**:
- Yarn: Additional tool to install
- pnpm: Less common, potential compatibility issues

---

## Node.js Runtime

### Node.js 18.x / 20.x / 22.x
**Type**: JavaScript runtime  
**Why Chosen**:
- LTS versions for stability
- ES Modules support
- Modern JavaScript features
- Vercel serverless compatibility

**Module System**: ES Modules (`type: "module"` in package.json)

---

## Hosting & Deployment

### Vercel
**Type**: Hosting platform  
**Why Chosen**:
- Made by Next.js creators (best compatibility)
- Automatic deployments on git push
- Edge network (global CDN)
- Serverless functions (no server management)
- Zero configuration for Next.js
- Environment variable management
- Free tier for MVP

**Deployment**: Automatic on push to main branch  
**Build**: Next.js build + TypeScript check  
**Functions**: Node.js 20.x serverless

**Alternatives Considered**:
- AWS: Complex setup, more DevOps work
- Netlify: Less Next.js optimization
- DigitalOcean: Requires server management

---

## Custom Architecture (v1.7.1)

### Centralized API Utilities
**Location**: `lib/api/`  
**Purpose**: Eliminate code duplication across 24 API routes

**Files Created**:
1. `middleware.ts` - Auth/validation middleware
2. `responses.ts` - Standardized response helpers
3. `withErrorHandler.ts` - Error boundary wrapper
4. `index.ts` - Unified exports

**Impact**: ~40% reduction in duplicated code

**Why Built**:
- DRY principle violation across all routes
- Inconsistent error responses
- Repeated try-catch patterns
- Manual auth checks everywhere

---

### Shared Component Library
**Location**: `components/shared/`  
**Purpose**: Reusable UI components with consistent styling

**Components**:
1. `Button.tsx` - 4 variants (primary, secondary, danger, ghost)
2. `Card.tsx` - Container with header/footer
3. `Badge.tsx` - 5 variants for status indicators
4. `LoadingSpinner.tsx` - 3 sizes

**Impact**: Eliminated 34+ instances of inline styling duplication

**Why Built**:
- Repeated Tailwind classes across pages
- Inconsistent button/badge styling
- Hard to maintain design system
- No single source of truth for UI

---

## Technology Decision Matrix

| Technology | Complexity | Cost | Performance | Scalability | Team Familiarity | Score |
|------------|------------|------|-------------|-------------|------------------|-------|
| Next.js | Medium | Free | High | High | High | ⭐⭐⭐⭐⭐ |
| MongoDB | Low | Free* | High | High | Medium | ⭐⭐⭐⭐⭐ |
| TypeScript | Medium | Free | High | High | High | ⭐⭐⭐⭐⭐ |
| Tailwind | Low | Free | High | High | Medium | ⭐⭐⭐⭐ |
| imgbb | Low | Free* | Medium | Medium | Low | ⭐⭐⭐⭐ |
| Vercel | Low | Free* | High | High | High | ⭐⭐⭐⭐⭐ |

*Free tier sufficient for MVP, paid plans available for scale

---

## Future Considerations

### Potential Additions
- **React Query**: Client-side caching, better data fetching
- **Zod**: Runtime schema validation (replace `validateRequiredFields`)
- **Redis**: Caching layer for frequently accessed data
- **Sentry**: Error monitoring and tracking
- **PostHog**: Product analytics

### When to Add
- React Query: When client-side data fetching becomes complex
- Zod: When input validation needs become more sophisticated
- Redis: When database queries become a bottleneck
- Sentry: Before production launch
- PostHog: After MVP validation

---

## Technology Upgrade Strategy

### Next.js
- Check compatibility before minor version upgrades
- Test thoroughly before major version upgrades
- Follow Next.js upgrade guides

### Dependencies
- Run `npm audit` monthly for security vulnerabilities
- Update patch versions automatically (low risk)
- Update minor versions quarterly (medium risk)
- Plan major version upgrades (high risk, breaking changes)

---

**Document Maintenance**: Update this document when adding new technologies or changing existing ones. Include rationale for all changes.
