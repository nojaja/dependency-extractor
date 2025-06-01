import { jest } from '@jest/globals';
import path from 'path';

// Create mock functions
const mockReadFile = jest.fn();
const mockExistsSync = jest.fn();
const mockUnlinkSync = jest.fn();
const mockExecPromise = jest.fn();
const mockParseFunction = jest.fn();

// Mock fs modules using unstable_mockModule for ESM compatibility
jest.unstable_mockModule('fs/promises', () => ({
    readFile: mockReadFile
}));

jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync
}));

jest.unstable_mockModule('child_process', () => ({
    exec: jest.fn()
}));

jest.unstable_mockModule('util', () => ({
    promisify: jest.fn(() => mockExecPromise)
}));

// Mock fast-xml-parser
jest.unstable_mockModule('fast-xml-parser', () => ({
    XMLParser: jest.fn().mockImplementation(() => ({
        parse: mockParseFunction
    }))
}));

// Import after mocking
const { MavenExtractor } = await import('../../src/extractors/mavenExtractor.js');

describe('mavenExtractor', () => {
    const mockProjectPath = '/mock/project';    beforeEach(() => {
        // Reset the mocks before each test
        jest.clearAllMocks();
        mockReadFile.mockReset();
        mockExistsSync.mockReset();
        mockUnlinkSync.mockReset();
        mockExecPromise.mockReset();
        mockParseFunction.mockReset();
    });

    test('should extract dependencies from pom.xml using effective-pom', async () => {
        const pomContent = 'pom xml content';
        const effectivePomContent = 'effective pom xml content';        // Mock file system operations
        mockReadFile
            .mockResolvedValueOnce(pomContent) // First call for pom.xml
            .mockResolvedValueOnce(effectivePomContent); // Second call for effective-pom.xml        // Mock exec command for mvn help:effective-pom
        mockExecPromise.mockResolvedValue({ stdout: '', stderr: '' });

        // Mock XML parser calls - first for pom.xml, second for effective-pom.xml
        mockParseFunction
            .mockReturnValueOnce({
                project: {
                    groupId: 'com.example',
                    artifactId: 'test-project',
                    version: '1.0.0'
                }
            })
            .mockReturnValueOnce({
                project: {
                    dependencies: {
                        dependency: [
                            {
                                groupId: 'org.apache.commons',
                                artifactId: 'commons-lang3',
                                version: '3.12.0',
                                scope: 'compile'
                            },
                            {
                                groupId: 'junit',
                                artifactId: 'junit',
                                version: '4.13.2',
                                scope: 'test'
                            }
                        ]
                    }
                }
            });        const extractor = new MavenExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');

        expect(dependencies).toEqual([
            { projectType: 'MAVEN', projectPath: path.join('.', 'pom.xml'), dependencyName: 'org.apache.commons:commons-lang3', dependencyVersion: '3.12.0', isDev: false },
            { projectType: 'MAVEN', projectPath: path.join('.', 'pom.xml'), dependencyName: 'junit:junit', dependencyVersion: '4.13.2', isDev: true }
        ]);
        expect(dependencies.length).toBe(2);
    });    test('should return empty array if pom.xml does not exist', async () => {
        // Mock file read error
        mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

        const extractor = new MavenExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        
        expect(dependencies).toEqual([]);
    });

    test('should handle XML parsing errors gracefully', async () => {
        const invalidPomContent = 'invalid xml content';

        mockReadFile.mockResolvedValueOnce(invalidPomContent);
        mockParseFunction.mockImplementation(() => {
            throw new Error('XML parse error');
        });

        const extractor = new MavenExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        
        expect(dependencies).toEqual([]);
    });

    test('should handle mvn command execution failure', async () => {
        const pomContent = 'pom xml content';

        mockReadFile.mockResolvedValueOnce(pomContent);
        mockParseFunction.mockReturnValueOnce({
            project: {
                groupId: 'com.example',
                artifactId: 'test-project',
                version: '1.0.0'
            }
        });

        // Mock exec command failure
        mockExecPromise.mockRejectedValue(new Error('Maven command failed'));

        const extractor = new MavenExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');
        
        expect(dependencies).toEqual([]);
    });

    test('should handle single dependency (not array) in XML structure', async () => {
        const pomContent = 'pom xml content';
        const effectivePomContent = 'effective pom xml content';

        mockReadFile
            .mockResolvedValueOnce(pomContent)
            .mockResolvedValueOnce(effectivePomContent);

        mockExecPromise.mockResolvedValue({ stdout: '', stderr: '' });

        mockParseFunction
            .mockReturnValueOnce({
                project: {
                    groupId: 'com.example',
                    artifactId: 'test-project',
                    version: '1.0.0'
                }
            })
            .mockReturnValueOnce({
                project: {
                    dependencies: {
                        dependency: {
                            groupId: 'org.apache.commons',
                            artifactId: 'commons-lang3',
                            version: '3.12.0',
                            scope: 'compile'
                        }
                    }
                }
            });

        const extractor = new MavenExtractor();
        const dependencies = await extractor.extractDependencies(mockProjectPath, './');

        expect(dependencies).toEqual([
            { projectType: 'MAVEN', projectPath: path.join('.', 'pom.xml'), dependencyName: 'org.apache.commons:commons-lang3', dependencyVersion: '3.12.0', isDev: false }
        ]);
    });

    test('MavenExtractor should be a class', () => {
        expect(typeof MavenExtractor).toBe('function');
        const extractor = new MavenExtractor();
        expect(extractor).toBeInstanceOf(MavenExtractor);
    });
});
