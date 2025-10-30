# Contributing to @x402-multichain/facilitator

Thank you for your interest in contributing! 🎉

## Getting Started

1. **Fork the repository**
2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/x402-multichain-facilitator.git
   cd x402-multichain-facilitator
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Build the project**:
   ```bash
   npm run build
   ```

## Development Workflow

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** in `packages/core/src/`

3. **Build and test**:
   ```bash
   npm run build
   npm run test
   ```

4. **Commit your changes**:
   ```bash
   git commit -m "feat: add your feature description"
   ```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test additions/changes
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### Pull Requests

1. **Push your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** on GitHub

3. **Describe your changes** clearly in the PR description

4. **Wait for review** - maintainers will review your PR

## Code Style

- Use TypeScript
- Follow existing code patterns
- Add JSDoc comments for public APIs
- Keep functions focused and testable

## Testing

Add tests for new features:

```typescript
// packages/core/test/your-feature.test.ts
import { describe, it, expect } from 'vitest';
import { YourFeature } from '../src/your-feature';

describe('YourFeature', () => {
  it('should work correctly', () => {
    // Your test here
  });
});
```

Run tests:
```bash
npm run test
```

## Adding New Chain Support

To add support for a new blockchain:

1. Create `packages/core/src/chains/your-chain/facilitator.ts`
2. Implement the `IChainFacilitator` interface
3. Add types in `packages/core/src/chains/your-chain/types.ts`
4. Update `MultichainFacilitatorManager` to support the new chain
5. Add documentation in `docs/your-chain-guide.md`
6. Add examples in `packages/examples/`

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new APIs
- Create guides in `docs/` for major features

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Reach out to maintainers

Thank you for contributing! 🚀

