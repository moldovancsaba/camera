# NAMING_GUIDE.md

**Project**: Camera — Photo Frame Webapp  
**Current Version**: 1.7.1  
**Last Updated**: 2025-11-06T19:05:13.000Z

Comprehensive naming conventions for consistent code style across the entire codebase.

---

## File Naming

### TypeScript/JavaScript Files
- **Format**: `kebab-case.ts` or `kebab-case.tsx`
- **Examples**: `mongodb.ts`, `with-error-handler.ts`, `api-responses.ts`
- **Rationale**: URL-friendly, lowercase prevents case-sensitivity issues on different OS

### React Components
- **Format**: `PascalCase.tsx`
- **Examples**: `Button.tsx`, `CameraCapture.tsx`, `LoadingSpinner.tsx`
- **Rationale**: Matches component name, clear distinction from utility files

### API Routes (Next.js)
- **Format**: `route.ts` in folder structure
- **Examples**: `app/api/events/route.ts`, `app/api/partners/[partnerId]/route.ts`
- **Rationale**: Next.js convention for API endpoints

### Pages (Next.js)
- **Format**: `page.tsx` in folder structure
- **Examples**: `app/admin/events/page.tsx`, `app/capture/[eventId]/page.tsx`
- **Rationale**: Next.js convention for page routes

### Configuration Files
- **Format**: `kebab-case.config.ts` or `.configrc`
- **Examples**: `next.config.ts`, `eslint.config.mjs`, `.eslintrc.json`
- **Rationale**: Standard configuration file patterns

---

## Variable Naming

### Regular Variables
- **Format**: `camelCase`
- **Examples**: `userName`, `eventId`, `isActive`, `submissionCount`
- **Rationale**: JavaScript standard, readable

### Boolean Variables
- **Prefix**: `is`, `has`, `should`, `can`
- **Examples**: `isActive`, `hasPermission`, `shouldRefresh`, `canEdit`
- **Rationale**: Makes boolean intent clear

### Constants
- **Format**: `UPPER_SNAKE_CASE`
- **Examples**: `SESSION_COOKIE_NAME`, `SESSION_MAX_AGE`, `API_BASE_URL`
- **Rationale**: Visually distinct, indicates immutable values

```typescript
// Good examples
const SESSION_COOKIE_NAME = 'camera_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const MAX_UPLOAD_SIZE = 32 * 1024 * 1024;
```

### Environment Variables
- **Format**: `UPPER_SNAKE_CASE`
- **Examples**: `MONGODB_URI`, `SSO_CLIENT_ID`, `IMGBB_API_KEY`
- **Rationale**: Shell/OS convention, visually distinct

---

## Function Naming

### Regular Functions
- **Format**: `camelCase`, verb-based
- **Examples**: `getUserData`, `validateInput`, `connectToDatabase`
- **Rationale**: Action-oriented, clear purpose

### Event Handlers (React)
- **Prefix**: `handle`
- **Examples**: `handleClick`, `handleSubmit`, `handleChange`
- **Rationale**: Clear indication of event handling

```typescript
// Good example
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  // logic
};
```

### Async Functions
- **No special prefix required** (TypeScript shows Promise return type)
- **Examples**: `fetchEvents`, `uploadImage`, `createSubmission`

### API Response Helpers (v1.7.1)
- **Prefix**: `api`
- **Examples**: `apiSuccess`, `apiError`, `apiUnauthorized`, `apiForbidden`
- **Rationale**: Namespace for API-specific helpers

### Middleware Functions (v1.7.1)
- **Prefix**: `require`, `optional`, `parse`, `validate`
- **Examples**: `requireAuth`, `requireAdmin`, `parsePaginationParams`, `validateRequiredFields`
- **Rationale**: Clear intent (require = throws, optional = no throw)

---

## Component Naming

### React Components
- **Format**: `PascalCase`
- **Examples**: `Button`, `CameraCapture`, `EventGallery`
- **Rationale**: React convention

### Component Props Interface
- **Format**: `ComponentNameProps`
- **Examples**: `ButtonProps`, `CardProps`, `BadgeProps`
- **Rationale**: Clear association with component

```typescript
// Good example
export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

export default function Button({ variant, size, children }: ButtonProps) {
  // implementation
}
```

### Higher-Order Components
- **Prefix**: `with`
- **Examples**: `withAuth`, `withErrorHandler`, `withLayout`
- **Rationale**: Clear indication of wrapper/enhancer pattern

---

## Type & Interface Naming

### Interfaces
- **Format**: `PascalCase`, no `I` prefix
- **Examples**: `Session`, `User`, `Event`, `Frame`
- **Rationale**: Modern TypeScript convention (no Hungarian notation)

### Type Aliases
- **Format**: `PascalCase`
- **Examples**: `ButtonVariant`, `FrameType`, `DeviceType`
- **Rationale**: Consistent with interfaces

### Enums
- **Format**: `PascalCase` for enum, `UPPER_SNAKE_CASE` for members
- **Examples**: 
```typescript
export enum FrameStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DRAFT = 'draft',
}
```
- **Rationale**: Clear distinction between type and values

---

## Database Naming

### Collection Names
- **Format**: `lowercase`, plural
- **Examples**: `partners`, `events`, `frames`, `submissions`, `slideshows`
- **Rationale**: MongoDB convention

### Field Names
- **Format**: `camelCase`
- **Examples**: `userId`, `eventId`, `createdAt`, `isActive`
- **Rationale**: Matches JavaScript object property convention

### MongoDB _id References
- **Format**: Store as string using `_id.toString()`
- **Field naming**: `entityId` (e.g., `eventId`, `partnerId`)
- **Rationale**: See docs/MONGODB_CONVENTIONS.md

```typescript
// Good example
const event = {
  _id: new ObjectId(),
  eventId: generateId(), // UUID for display
  partnerId: partner._id.toString(), // Reference stored as string
  createdAt: generateTimestamp(),
};
```

---

## API Route Naming

### RESTful Conventions
- **Format**: `/api/resource` or `/api/resource/[id]`
- **Examples**: `/api/events`, `/api/events/[id]`, `/api/partners/[partnerId]/toggle`

### HTTP Methods
- `GET` - Retrieve data
- `POST` - Create new resource
- `PATCH` - Update existing resource (partial)
- `PUT` - Replace existing resource (full)
- `DELETE` - Remove resource

### Route Parameters
- **Format**: `[paramName]` in folder structure
- **Examples**: `[id]`, `[eventId]`, `[partnerId]`
- **Rationale**: Next.js dynamic route convention

---

## CSS Class Naming (Tailwind)

### Utility Classes
- **Format**: Tailwind utilities
- **Examples**: `bg-blue-600`, `text-white`, `rounded-lg`, `hover:bg-blue-700`
- **Rationale**: Tailwind convention

### Custom Classes (if needed)
- **Format**: `kebab-case`
- **Examples**: `custom-scrollbar`, `glass-effect`
- **Rationale**: CSS standard

---

## Import/Export Patterns

### Named Exports (Preferred)
```typescript
// Good - named export
export function connectToDatabase() { }
export const SESSION_MAX_AGE = 30;
export interface Session { }
```

### Default Exports (Components only)
```typescript
// Good - default export for React components
export default function Button({ children }: ButtonProps) { }
```

### Barrel Exports (Index files)
```typescript
// Good - centralized exports
// lib/api/index.ts
export * from './middleware';
export * from './responses';
export * from './withErrorHandler';
```

---

## Comment Style

### File Headers
```typescript
/**
 * Brief description
 *
 * Detailed explanation of what this file does and why it exists.
 * (Released app semver lives in `package.json`; use `@/lib/app-version` in UI when needed.)
 * 
 * Usage:
 * ```typescript
 * // Example code
 * ```
 */
```

### Function Comments
```typescript
/**
 * Brief description of what function does
 * 
 * @param param1 - Description
 * @param param2 - Description  
 * @returns Description of return value
 * 
 * Why: Explain WHY this function exists and design decisions
 */
```

### Inline Comments
```typescript
// What: Validate MongoDB ObjectId format
// Why: Prevents invalid queries and potential errors
if (!ObjectId.isValid(id)) {
  throw apiBadRequest('Invalid ID format');
}
```

---

## Examples by Context

### API Route
```typescript
// app/api/events/route.ts
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const { page, limit } = parsePaginationParams(searchParams);
  
  const db = await connectToDatabase();
  const events = await db.collection('events').find().toArray();
  
  return apiSuccess({ events });
});
```

### React Component
```typescript
// components/shared/Button.tsx
export interface ButtonProps {
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  children: React.ReactNode;
}

export default function Button({ variant = 'primary', onClick, children }: ButtonProps) {
  return (
    <button onClick={onClick} className={variantClasses[variant]}>
      {children}
    </button>
  );
}
```

### Utility Function
```typescript
// lib/api/middleware.ts
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw apiUnauthorized('Authentication required');
  }
  return session;
}
```

---

## Anti-Patterns to Avoid

### ❌ Hungarian Notation
```typescript
// Bad
const strUserName = 'John';
const bIsActive = true;
const arrEvents = [];

// Good
const userName = 'John';
const isActive = true;
const events = [];
```

### ❌ Abbreviations
```typescript
// Bad
const usrDat = getUserData();
const evtId = '123';

// Good
const userData = getUserData();
const eventId = '123';
```

### ❌ Generic Names
```typescript
// Bad
const data = fetchData();
const handleClick = () => { };

// Good
const events = fetchEvents();
const handleSubmitForm = () => { };
```

### ❌ Inconsistent Naming
```typescript
// Bad - mixing conventions
const user_name = 'John';  // snake_case
const EventID = '123';     // PascalCase
const ISACTIVE = true;     // all caps

// Good - consistent camelCase
const userName = 'John';
const eventId = '123';
const isActive = true;
```

---

**Enforcement**: All code reviews must verify adherence to these conventions. Use ESLint and Prettier to automate where possible.

**Document Maintenance**: Update this guide when new patterns emerge or conventions change. All team members must review changes.
