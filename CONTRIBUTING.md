# Contributing

Thank you for your interest in contributing to the MapLibre Field plugin! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Requests](#pull-requests)
- [Reporting Issues](#reporting-issues)

## Getting Started

Before contributing, please:

1. **Check existing issues** to see if your bug/feature is already being discussed
2. **Open a new issue** for bugs or feature requests before starting work
3. **Fork the repository** and create a feature branch
4. **Follow our code style** and testing guidelines

## Development Setup

### Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn
- Git
- A Strapi v5 project for testing (optional but recommended)

### Clone and Install

```bash
# Fork the repository on GitHub first, then:
git clone https://github.com/YOUR-USERNAME/strapi-plugin-maplibre-field.git
cd strapi-plugin-maplibre-field

# Install dependencies
npm install

# Build the plugin
npm run build
```

### Testing in a Strapi Project

**Option 1: Using npm link** (recommended for development)

```bash
# In the plugin directory
npm link

# In your Strapi project directory
npm link @premiate/strapi-plugin-maplibre-field

# Add to config/plugins.ts
export default {
  "maplibre-field": {
    enabled: true,
  },
};

# Start Strapi in watch mode
npm run develop
```

**Option 2: Using local file path**

```bash
# In your Strapi project
npm install /path/to/strapi-plugin-maplibre-field
```

**Option 3: Create a test Strapi project**

```bash
npx create-strapi-app@latest my-test-app --quickstart
cd my-test-app
npm link /path/to/strapi-plugin-maplibre-field
```

### Watch Mode

For active development, use watch mode to automatically rebuild on changes:

```bash
# In the plugin directory
npm run watch
```

Then in your Strapi project:
```bash
npm run develop
```

Changes to the plugin will trigger automatic rebuilds.

## Project Structure

```
strapi-plugin-maplibre-field/
├── admin/                    # Frontend (Strapi admin panel)
│   └── src/
│       ├── components/       # React components
│       │   ├── Input.tsx     # Main map field component
│       │   └── ...
│       ├── index.tsx         # Plugin registration
│       └── translations/     # i18n files
│           ├── en.json
│           ├── it.json
│           └── ...
├── server/                   # Backend (Strapi server)
│   ├── register.ts           # Plugin registration
│   └── ...
├── tests/                    # Test files
├── docs/                     # Documentation
├── package.json
├── tsconfig.json
├── .eslintrc.js
└── README.md
```

### Key Files

**Frontend (admin/src/)**:
- `components/Input.tsx` - Main map field component with MapLibre GL
- `components/SearchBox.tsx` - Geocoding search component
- `components/LayerControl.tsx` - POI layer toggle component
- `index.tsx` - Plugin registration and configuration
- `translations/*.json` - Internationalization files

**Backend (server/)**:
- `register.ts` - Plugin lifecycle registration
- Currently minimal (field is client-side only)

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes

- Write clean, readable code
- Follow TypeScript best practices
- Add comments for complex logic
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Build the plugin
npm run build

# Test in a real Strapi project
# (see "Testing in a Strapi Project" above)
```

### 4. Commit Your Changes

Use clear, descriptive commit messages:

```bash
git add .
git commit -m "feat: add support for polygon geometries"
# or
git commit -m "fix: correct coordinate order in GeoJSON"
# or
git commit -m "docs: update POI integration examples"
```

**Commit message format**:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub.

## Code Style

### TypeScript

We use TypeScript strict mode. All code must be properly typed:

```typescript
// ✅ Good
interface Location {
  geometry: {
    coordinates: [number, number];
  };
  properties: {
    name?: string;
  };
}

function displayLocation(location: Location): void {
  // ...
}

// ❌ Bad
function displayLocation(location: any) {
  // ...
}
```

### ESLint and Prettier

The project uses ESLint and Prettier for code formatting:

```bash
# Check for linting errors
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

**Configuration files**:
- `.eslintrc.js` - ESLint rules
- `.prettierrc` - Prettier formatting

### React/JSX

**Component structure**:

```tsx
import { useState, useEffect } from 'react';

interface MyComponentProps {
  location: Location;
  onSave: (location: Location) => void;
}

export function MyComponent({ location, onSave }: MyComponentProps) {
  const [state, setState] = useState(null);
  
  useEffect(() => {
    // Effect logic
  }, [location]);
  
  return (
    <div>
      {/* JSX */}
    </div>
  );
}
```

**Naming conventions**:
- Components: PascalCase (`LocationMap`, `SearchBox`)
- Props interfaces: `ComponentNameProps`
- Hooks: camelCase with `use` prefix (`useMapInstance`, `useGeocoding`)
- Functions: camelCase (`handleClick`, `fetchLocations`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_ZOOM`, `MAX_RESULTS`)

### Comments

Add comments for:
- Complex logic
- Non-obvious behavior
- Workarounds or hacks
- TODOs

```typescript
// Reverse coordinates for Leaflet (uses [lat, lng] instead of [lng, lat])
const leafletCoords = [lat, lng];

// TODO: Add support for polygon geometries in future version
```

## Testing

### Manual Testing Checklist

Before submitting a PR, test these scenarios:

**Basic functionality**:
- [ ] Map loads and displays correctly
- [ ] Search box returns results
- [ ] Clicking search result places marker
- [ ] Double-clicking map places marker
- [ ] Location data is saved correctly

**POI features** (if applicable):
- [ ] POI markers appear at correct zoom level
- [ ] Clicking POI marker selects it
- [ ] Layer control toggles POI layers
- [ ] Search includes POI results
- [ ] POI metadata is preserved

**Edge cases**:
- [ ] Empty/null location data handled gracefully
- [ ] Invalid coordinates rejected
- [ ] Geocoding errors displayed to user
- [ ] Map works with different style providers

**Browser compatibility**:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)

### Unit Tests

Currently, the plugin has basic test setup:

```bash
# Run tests
npm test

# Run tests in watch mode
npm test -- --watch
```

**We welcome contributions to improve test coverage!**

Ideal areas for testing:
- Coordinate validation
- GeoJSON structure validation
- POI filtering and display logic
- Geocoding response handling

## Pull Requests

### Before Submitting

1. **Update documentation** if you've changed functionality
2. **Test thoroughly** in a real Strapi project
3. **Run linter** and fix all issues
4. **Update CHANGELOG.md** with your changes (under "Unreleased")
5. **Rebase on main** to ensure no conflicts

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## How Has This Been Tested?
Describe the tests you ran and their results.

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have tested this in a Strapi v5 project
```

### Review Process

1. A maintainer will review your PR within 1-2 weeks
2. Address any feedback or requested changes
3. Once approved, your PR will be merged
4. Your contribution will be included in the next release

## Reporting Issues

### Bug Reports

Use the [GitHub Issues](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/issues) page.

**Include**:
- **Strapi version** (e.g., 5.0.0)
- **Plugin version** (e.g., 1.0.0)
- **Browser** (if frontend issue)
- **Steps to reproduce**
- **Expected behavior**
- **Actual behavior**
- **Screenshots** (if applicable)
- **Error messages** (from browser console or server logs)

**Example**:

```markdown
**Strapi Version**: 5.0.0
**Plugin Version**: 1.0.0
**Browser**: Chrome 120

**Steps to Reproduce**:
1. Add map field to content type
2. Open content editor
3. Search for "Milano"
4. Map doesn't load

**Expected**: Map should display with search results
**Actual**: White box shown instead of map

**Error in Console**:
```
Error: worker-src directive missing in CSP
```

**Screenshots**: [attached]
```

### Feature Requests

Open an issue with:
- **Clear description** of the feature
- **Use case** - why is this useful?
- **Proposed solution** (optional)
- **Alternatives considered** (optional)

## Development Tips

### Debugging

**Enable verbose logging**:

```typescript
// In admin/src/components/Input.tsx
console.log('Location selected:', location);
console.log('POI data:', poiData);
```

**Browser DevTools**:
- Network tab: Check API requests to POI sources, Nominatim
- Console: Look for JavaScript errors
- React DevTools: Inspect component state

**Strapi Admin Panel**:
- Check browser console for errors
- Use Redux DevTools to inspect Strapi state

### Working with MapLibre

**Resources**:
- [MapLibre GL JS Docs](https://maplibre.org/maplibre-gl-js/docs/)
- [MapLibre Style Spec](https://maplibre.org/maplibre-style-spec/)
- [React Map GL Docs](https://visgl.github.io/react-map-gl/)

**Common patterns**:

```typescript
// Add a layer
map.addLayer({
  id: 'my-layer',
  type: 'circle',
  source: 'my-source',
  paint: {
    'circle-color': '#ff0000',
    'circle-radius': 8,
  },
});

// Listen for events
map.on('click', 'my-layer', (e) => {
  console.log('Clicked feature:', e.features[0]);
});

// Update map center
map.setCenter([lng, lat]);
```

### Working with Nominatim

**API endpoint**:
```
https://nominatim.openstreetmap.org/search?format=json&q=milano
```

**Rate limiting**: 
- Max 1 request per second
- Use self-hosted instance for development

**Response format**:
```json
[
  {
    "place_id": 123,
    "osm_type": "node",
    "osm_id": 456,
    "lat": "45.4642",
    "lon": "9.1900",
    "display_name": "Milano, Lombardia, Italia",
    "type": "city"
  }
]
```

## Getting Help

- **GitHub Discussions**: Ask questions, share ideas
- **GitHub Issues**: Report bugs, request features
- **Documentation**: Check [docs/](docs/) folder

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers
- Focus on what is best for the community
- Show empathy towards others

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Personal attacks or trolling
- Spam or off-topic discussions

### Enforcement

Project maintainers have the right to remove, edit, or reject comments, commits, code, issues, and other contributions that do not align with this Code of Conduct.

---

Thank you for contributing to MapLibre Field! 🗺️
