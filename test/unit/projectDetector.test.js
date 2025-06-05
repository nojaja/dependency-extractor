import { jest } from '@jest/globals';
import path from 'path';

// Create mock functions
const mockWalk = jest.fn();
const mockExistsSync = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerError = jest.fn();

// Mock fs modules using unstable_mockModule for ESM compatibility
jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync
}));

// Mock log4js with default export
jest.unstable_mockModule('log4js', () => ({
    default: {
        getLogger: jest.fn(() => ({
            info: mockLoggerInfo,
            debug: mockLoggerDebug,
            error: mockLoggerError
        }))
    }
}));

// Mock DirWalker
jest.unstable_mockModule('../../src/utils/dirWalker.js', () => ({
    DirWalker: jest.fn().mockImplementation(() => ({
        walk: mockWalk
    }))
}));

// Import after mocking
const { ProjectDetector, ProjectType, ProjectFiles } = await import('../../src/detectors/projectDetector.js');

describe('ProjectDetector', () => {
    const mockProjectPath = path.normalize('/mock/project');

    beforeEach(() => {
        // Reset the mocks before each test
        jest.clearAllMocks();
        mockWalk.mockReset();
        mockExistsSync.mockReset();
        mockLoggerInfo.mockReset();
        mockLoggerDebug.mockReset();
        mockLoggerError.mockReset();
    });

    describe('detect method', () => {
        test('should detect NPM project when package.json exists', async () => {
            // Setup mock: simulate DirWalker calling fileCallback for package.json
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('package.json', settings);
                return 1; // processed files count
            });

            const detector = new ProjectDetector();
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: ProjectType.NPM,
                path: path.dirname(path.join(mockProjectPath, 'package.json')),
                file: 'package.json',
                relativePath: 'package.json'
            });
            expect(mockWalk).toHaveBeenCalledWith(
                mockProjectPath,
                {},
                expect.any(Function),
                expect.any(Function)
            );
            expect(mockLoggerInfo).toHaveBeenCalledWith(`リポジトリのプロジェクトを検索中: ${mockProjectPath}`);
        });

        test('should detect Maven project when pom.xml exists', async () => {
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('pom.xml', settings);
                return 1;
            });

            const detector = new ProjectDetector();
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: ProjectType.MAVEN,
                path: path.dirname(path.join(mockProjectPath, 'pom.xml')),
                file: 'pom.xml',
                relativePath: 'pom.xml'
            });
        });

        test('should detect Gradle project when build.gradle exists', async () => {
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('build.gradle', settings);
                return 1;
            });

            const detector = new ProjectDetector();
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: ProjectType.GRADLE,
                path: path.dirname(path.join(mockProjectPath, 'build.gradle')),
                file: 'build.gradle',
                relativePath: 'build.gradle'
            });
        });

        test('should detect Gradle project when build.gradle.kts exists', async () => {
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('build.gradle.kts', settings);
                return 1;
            });

            const detector = new ProjectDetector();
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: ProjectType.GRADLE,
                path: path.dirname(path.join(mockProjectPath, 'build.gradle.kts')),
                file: 'build.gradle.kts',
                relativePath: 'build.gradle.kts'
            });
        });

        test('should detect Composer project when composer.json exists', async () => {
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('composer.json', settings);
                return 1;
            });

            const detector = new ProjectDetector();
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: ProjectType.COMPOSER,
                path: path.dirname(path.join(mockProjectPath, 'composer.json')),
                file: 'composer.json',
                relativePath: 'composer.json'
            });
        });

        test('should detect multiple projects in single repository', async () => {
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('frontend/package.json', settings);
                await fileCallback('backend/pom.xml', settings);
                await fileCallback('api/composer.json', settings);
                await fileCallback('mobile/build.gradle', settings);
                return 4;
            });

            const detector = new ProjectDetector();
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(4);
            
            const npmProject = result.find(p => p.type === ProjectType.NPM);
            expect(npmProject).toEqual({
                type: ProjectType.NPM,
                path: path.dirname(path.join(mockProjectPath, 'frontend/package.json')),
                file: 'package.json',
                relativePath: 'frontend/package.json'
            });

            const mavenProject = result.find(p => p.type === ProjectType.MAVEN);
            expect(mavenProject).toEqual({
                type: ProjectType.MAVEN,
                path: path.dirname(path.join(mockProjectPath, 'backend/pom.xml')),
                file: 'pom.xml',
                relativePath: 'backend/pom.xml'
            });

            const composerProject = result.find(p => p.type === ProjectType.COMPOSER);
            expect(composerProject).toEqual({
                type: ProjectType.COMPOSER,
                path: path.dirname(path.join(mockProjectPath, 'api/composer.json')),
                file: 'composer.json',
                relativePath: 'api/composer.json'
            });

            const gradleProject = result.find(p => p.type === ProjectType.GRADLE);
            expect(gradleProject).toEqual({
                type: ProjectType.GRADLE,
                path: path.dirname(path.join(mockProjectPath, 'mobile/build.gradle')),
                file: 'build.gradle',
                relativePath: 'mobile/build.gradle'
            });
        });

        test('should return empty array when no project files found', async () => {
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                // No project files called back
                return 3; // processed files count
            });

            const detector = new ProjectDetector();
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(0);
            expect(mockLoggerInfo).toHaveBeenCalledWith(`リポジトリのプロジェクトを検索中: ${mockProjectPath}`);
            expect(mockLoggerInfo).toHaveBeenCalledWith('処理完了: 3 ファイルをスキャン、0 プロジェクトを検出');
        });

        test('should handle DirWalker errors gracefully', async () => {
            const errorMessage = 'Permission denied';
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                errorCallback(new Error(errorMessage));
                return 0;
            });

            const detector = new ProjectDetector();
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(0);
            expect(mockLoggerError).toHaveBeenCalledWith(`プロジェクト検索中にエラーが発生しました: ${errorMessage}`);
        });

        test('should log debug information when debug mode is enabled', async () => {
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('package.json', settings);
                return 1;
            });

            const detector = new ProjectDetector(true); // debug mode enabled
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(1);
            expect(mockLoggerDebug).toHaveBeenCalledWith('検出: NPM プロジェクト - package.json');
        });

        test('should handle same project type in different directories', async () => {
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('module1/package.json', settings);
                await fileCallback('module2/package.json', settings);
                return 2;
            });

            const detector = new ProjectDetector();
            const result = await detector.detectProjects(mockProjectPath);

            expect(result).toHaveLength(2);
            
            expect(result[0]).toEqual({
                type: ProjectType.NPM,
                path: path.dirname(path.join(mockProjectPath, 'module1/package.json')),
                file: 'package.json',
                relativePath: 'module1/package.json'
            });

            expect(result[1]).toEqual({
                type: ProjectType.NPM,
                path: path.dirname(path.join(mockProjectPath, 'module2/package.json')),
                file: 'package.json',
                relativePath: 'module2/package.json'
            });
        });
    });

    describe('detectProjectsStreaming method', () => {
        test('should call callback for each detected project', async () => {
            // Setup: Mock the walk method to simulate finding two files
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                // Simulate finding package.json files
                await fileCallback('module1/package.json', settings);
                await fileCallback('module2/package.json', settings);
                return 2; // Return number of files processed
            });

            const detector = new ProjectDetector(false);
            const mockCallback = jest.fn();

            // Execute
            const result = await detector.detectProjectsStreaming(mockProjectPath, mockCallback);

            // Verify
            expect(result).toBe(2); // Should return number of projects detected
            expect(mockCallback).toHaveBeenCalledTimes(2);
            
            // Check first callback call
            expect(mockCallback).toHaveBeenNthCalledWith(1, {
                type: ProjectType.NPM,
                path: path.dirname(path.join(mockProjectPath, 'module1/package.json')),
                file: 'package.json',
                relativePath: 'module1/package.json'
            });

            // Check second callback call
            expect(mockCallback).toHaveBeenNthCalledWith(2, {
                type: ProjectType.NPM,
                path: path.dirname(path.join(mockProjectPath, 'module2/package.json')),
                file: 'package.json',
                relativePath: 'module2/package.json'
            });
        });

        test('should handle callback errors gracefully', async () => {
            // Setup: Mock the walk method to simulate finding one file
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('package.json', settings);
                return 1;
            });

            const detector = new ProjectDetector(false);
            const mockCallback = jest.fn().mockRejectedValue(new Error('Callback error'));

            // Execute
            const result = await detector.detectProjectsStreaming(mockProjectPath, mockCallback);

            // Verify: Should still return count even if callback fails
            expect(result).toBe(1);
            expect(mockCallback).toHaveBeenCalledTimes(1);
            expect(mockLoggerError).toHaveBeenCalledWith(
                expect.stringContaining('プロジェクト処理中にエラーが発生しました')
            );
        });

        test('should not count non-project files', async () => {
            // Setup: Mock the walk method to simulate finding non-project files
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('README.md', settings);
                await fileCallback('src/index.js', settings);
                return 2;
            });

            const detector = new ProjectDetector(false);
            const mockCallback = jest.fn();

            // Execute
            const result = await detector.detectProjectsStreaming(mockProjectPath, mockCallback);

            // Verify: Should not call callback for non-project files
            expect(result).toBe(0);
            expect(mockCallback).not.toHaveBeenCalled();
        });

        test('should process mixed project types in streaming mode', async () => {
            // Setup: Mock the walk method to simulate finding different project files
            mockWalk.mockImplementation(async (repoPath, settings, fileCallback, errorCallback) => {
                await fileCallback('package.json', settings);
                await fileCallback('pom.xml', settings);
                await fileCallback('composer.json', settings);
                return 3;
            });

            const detector = new ProjectDetector(false);
            const mockCallback = jest.fn();

            // Execute
            const result = await detector.detectProjectsStreaming(mockProjectPath, mockCallback);

            // Verify
            expect(result).toBe(3);
            expect(mockCallback).toHaveBeenCalledTimes(3);
            
            // Check that different project types were detected
            const callArguments = mockCallback.mock.calls.map(call => call[0]);
            expect(callArguments.some(arg => arg.type === ProjectType.NPM)).toBe(true);
            expect(callArguments.some(arg => arg.type === ProjectType.MAVEN)).toBe(true);
            expect(callArguments.some(arg => arg.type === ProjectType.COMPOSER)).toBe(true);
        });
    });

    describe('exports', () => {
        test('should export ProjectType constants', () => {
            expect(ProjectType.NPM).toBe('NPM');
            expect(ProjectType.MAVEN).toBe('Maven');
            expect(ProjectType.GRADLE).toBe('Gradle');
            expect(ProjectType.COMPOSER).toBe('Composer');
        });

        test('should export ProjectFiles configuration', () => {
            expect(ProjectFiles[ProjectType.NPM]).toEqual(['package.json']);
            expect(ProjectFiles[ProjectType.MAVEN]).toEqual(['pom.xml']);
            expect(ProjectFiles[ProjectType.GRADLE]).toEqual(['build.gradle', 'build.gradle.kts']);
            expect(ProjectFiles[ProjectType.COMPOSER]).toEqual(['composer.json']);
        });
    });
});
