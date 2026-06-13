/**
 * Jest config for the integrity test suite (rules + money/ledger units).
 *
 * Runs under the Firestore emulator: invoke via
 *   firebase emulators:exec --only firestore 'jest --config jest.rules.config.js'
 * which boots the emulator, sets FIRESTORE_EMULATOR_HOST, runs jest, then tears
 * the emulator down. The @firebase/rules-unit-testing client picks up the host
 * env var automatically.
 *
 * ts-jest compiles the TS tests in-process (no separate build step). We pin a
 * permissive tsconfig for the tests: the production tsconfig sets
 * noUnusedLocals/noUnusedParameters which would reject test scaffolding, and its
 * rootDir excludes test/. Tests still import the REAL source under src/ so the
 * money math under test is exactly what ships.
 */
module.exports = {
  displayName: 'integrity',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  // Generous timeout: emulator round-trips + rules get() calls are slower than
  // pure unit tests.
  testTimeout: 30_000,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'es2020',
          module: 'commonjs',
          lib: ['es2020'],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          moduleResolution: 'node',
          // Test files legitimately keep helper locals/params around.
          noUnusedLocals: false,
          noUnusedParameters: false,
          types: ['jest', 'node'],
        },
      },
    ],
  },
};
