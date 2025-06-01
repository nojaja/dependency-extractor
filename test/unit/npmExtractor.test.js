import { jest } from '@jest/globals';
import path from 'path';

// Create mock functions
const mockReadFile = jest.fn();
const mockExistsSync = jest.fn();

// Mock fs modules using unstable_mockModule for ESM compatibility
jest.unstable_mockModule('fs/promises', () => ({
    readFile: mockReadFile
}));

jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync
}));

// Import after mocking
const { NpmExtractor } = await import('../../src/extractors/npmExtractor.js');

describe('npmExtractor', () => {
    const mockProjectPath = '/mock/project';    beforeEach(() => {
        // Reset the mocks before each test
        jest.clearAllMocks();
        mockReadFile.mockReset();
        mockExistsSync.mockReset();
    });test('should extract dependencies from package.json if no lock file exists', async () => {
        const packageJsonContent = {
            dependencies: {
                'lib-a': '^1.0.0',
            },
            devDependencies: {
                'dev-lib-b': '~2.1.0',
            },
        };
          // Mock package-lock.json and yarn.lock not existing
        mockExistsSync
            .mockReturnValueOnce(false) // package-lock.json does not exist
            .mockReturnValueOnce(false); // yarn.lock does not exist
          // Mock fs.readFile for package.json
        mockReadFile.mockResolvedValueOnce(JSON.stringify(packageJsonContent));

        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');        expect(dependencies).toEqual([
            { projectType: 'NPM', projectPath: path.join('.', 'package.json'), dependencyName: 'lib-a', dependencyVersion: '^1.0.0', isDev: false },
            { projectType: 'NPM', projectPath: path.join('.', 'package.json'), dependencyName: 'dev-lib-b', dependencyVersion: '~2.1.0', isDev: true },
        ]);
        expect(mockReadFile).toHaveBeenCalledWith(path.join(mockProjectPath, 'package.json'), 'utf8');
    });    test('should return empty array if package.json does not exist', async () => {
        // package.jsonの読み込みでエラーが発生することをシミュレート
        mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));
        
        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        expect(dependencies).toEqual([]);
    });    test('should handle package.json with no dependencies', async () => {
        const packageJsonContent = {};
        
        mockExistsSync
            .mockReturnValueOnce(false) // package-lock.json does not exist
            .mockReturnValueOnce(false); // yarn.lock does not exist
        
        mockReadFile.mockResolvedValueOnce(JSON.stringify(packageJsonContent));

        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        expect(dependencies).toEqual([]);
    });    test('should handle package.json with empty dependencies and devDependencies', async () => {
        const packageJsonContent = {
            dependencies: {},
            devDependencies: {},
        };
        
        mockExistsSync
            .mockReturnValueOnce(false) // package-lock.json does not exist
            .mockReturnValueOnce(false); // yarn.lock does not exist
        
        mockReadFile.mockResolvedValueOnce(JSON.stringify(packageJsonContent));

        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        expect(dependencies).toEqual([]);
    });test('should extract dependencies from package-lock.json (v2/v3) if present', async () => {
        const packageJsonContent = { name: "test-project", version: "1.0.0" };
        const lockFileContentV3 = {
            name: 'test-project',
            version: '1.0.0',
            lockfileVersion: 3,
            requires: true,
            packages: {
                '': { name: 'test-project', version: '1.0.0', dependencies: { 'lib-c': '1.2.3' }, devDependencies: { 'dev-lib-e': '7.8.9' } },
                'node_modules/lib-c': { version: '1.2.3' },
                'node_modules/dev-lib-e': { version: '7.8.9', dev: true },
                'node_modules/transitive-lib': { version: '0.1.0' }
            },
        };          mockExistsSync.mockReturnValueOnce(true); // package-lock.json exists
        
        mockReadFile
            .mockResolvedValueOnce(JSON.stringify(packageJsonContent)) // First call for package.json
            .mockResolvedValueOnce(JSON.stringify(lockFileContentV3)); // Second call for package-lock.json

        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');        expect(mockReadFile).toHaveBeenCalledWith(path.join(mockProjectPath, 'package.json'), 'utf8');
        expect(mockReadFile).toHaveBeenCalledWith(path.join(mockProjectPath, 'package-lock.json'), 'utf8');
        expect(dependencies).toEqual(expect.arrayContaining([
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'lib-c', dependencyVersion: '1.2.3', isDev: false },
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'dev-lib-e', dependencyVersion: '7.8.9', isDev: true },
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'transitive-lib', dependencyVersion: '0.1.0', isDev: false },
        ]));
        expect(dependencies.length).toBe(3);
    });    test('should correctly identify dev dependencies from package-lock.json (v2/v3) based on "dev" flag', async () => {
        const packageJsonContent = { name: "test-project", version: "1.0.0" };
        const lockFileContent = {
            name: 'test-project',
            version: '1.0.0',
            lockfileVersion: 2,
            packages: {
                '': { dependencies: { 'prod-lib': '1.0.0' }, devDependencies: { 'dev-lib': '1.0.0' } },
                'node_modules/prod-lib': { version: '1.0.0' },
                'node_modules/dev-lib': { version: '1.0.0', dev: true },
                'node_modules/transitive-dev-lib': { version: '2.0.0', dev: true },
                'node_modules/transitive-prod-lib': { version: '3.0.0' }
            },
        };
          mockExistsSync.mockReturnValueOnce(true); // package-lock.json exists
        
        mockReadFile
            .mockResolvedValueOnce(JSON.stringify(packageJsonContent))
            .mockResolvedValueOnce(JSON.stringify(lockFileContent));

        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        expect(dependencies).toEqual(expect.arrayContaining([
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'prod-lib', dependencyVersion: '1.0.0', isDev: false },
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'dev-lib', dependencyVersion: '1.0.0', isDev: true },
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'transitive-dev-lib', dependencyVersion: '2.0.0', isDev: true },
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'transitive-prod-lib', dependencyVersion: '3.0.0', isDev: false },
        ]));
        expect(dependencies.length).toBe(4);
    });    test('should handle errors when parsing invalid package.json', async () => {
        mockReadFile.mockRejectedValueOnce(new Error('JSON parse error')); // Simulate read error or parse error

        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        expect(dependencies).toEqual([]);
    });test('should handle errors when parsing invalid package-lock.json', async () => {
        const packageJsonContent = { name: "test-project", version: "1.0.0", dependencies: {"fallback-dep": "1.0.0"} }; // Added a fallback dep
          mockExistsSync.mockReturnValueOnce(true); // package-lock.json exists
        
        mockReadFile
            .mockResolvedValueOnce(JSON.stringify(packageJsonContent)) // package.json reads fine
            .mockRejectedValueOnce(new Error('JSON parse error')); // package-lock.json fails to read/parse

        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        
        // Expect fallback to package.json
        expect(dependencies).toEqual([
            { projectType: 'NPM', projectPath: path.join('.', 'package.json'), dependencyName: 'fallback-dep', dependencyVersion: '1.0.0', isDev: false },
        ]);
    });    test('should correctly parse package-lock.json v1 format', async () => {
        const packageJsonContent = { name: "test-project", version: "1.0.0" };
        const lockFileContentV1 = {
            name: 'test-project-v1',
            version: '1.0.0',
            lockfileVersion: 1,
            requires: true,
            dependencies: {
                'lib-f': { version: '3.0.0', requires: { 'transitive-g': '0.5.0' } },
                'dev-lib-h': { version: '4.0.0', dev: true },
                'transitive-g': { version: '0.5.0' }
            }
        };          mockExistsSync.mockReturnValueOnce(true); // package-lock.json exists
        
        mockReadFile
            .mockResolvedValueOnce(JSON.stringify(packageJsonContent))
            .mockResolvedValueOnce(JSON.stringify(lockFileContentV1));

        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');

        expect(dependencies).toEqual(expect.arrayContaining([
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'lib-f', dependencyVersion: '3.0.0', isDev: false },
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'dev-lib-h', dependencyVersion: '4.0.0', isDev: true },
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'transitive-g', dependencyVersion: '0.5.0', isDev: false },
        ]));
        expect(dependencies.length).toBe(3);
    });    test('should skip root project entry in package-lock.json "packages" section', async () => {
        const packageJsonContent = { name: "test-project", version: "1.0.0" };
        const lockFileContent = {
            name: 'test-project',
            version: '1.0.0',
            lockfileVersion: 3,
            packages: {
                '': { name: 'test-project', version: '1.0.0' },
                'node_modules/lib-x': { version: '1.0.0' }
            }
        };
          mockExistsSync.mockReturnValueOnce(true); // package-lock.json exists
        
        mockReadFile
            .mockResolvedValueOnce(JSON.stringify(packageJsonContent))
            .mockResolvedValueOnce(JSON.stringify(lockFileContent));

        const extractor = new NpmExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        expect(dependencies).toEqual([
            { projectType: 'NPM', projectPath: path.join('.', 'package-lock.json'), dependencyName: 'lib-x', dependencyVersion: '1.0.0', isDev: false },
        ]);
    });

    // Test for NpmExtractor class itself
    test('NpmExtractor should be a class', () => {
        expect(typeof NpmExtractor).toBe('function');
        const extractor = new NpmExtractor();
        expect(extractor).toBeInstanceOf(NpmExtractor);
    });
});
