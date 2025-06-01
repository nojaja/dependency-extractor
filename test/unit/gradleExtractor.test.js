
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ESM module mocking using jest.unstable_mockModule
const mockReadFile = jest.fn();
const mockExistsSync = jest.fn();
const mockExecPromise = jest.fn();

jest.unstable_mockModule('fs/promises', () => ({
  readFile: mockReadFile
}));

jest.unstable_mockModule('fs', () => ({
  existsSync: mockExistsSync
}));

jest.unstable_mockModule('util', () => ({
  promisify: jest.fn(() => mockExecPromise)
}));

jest.unstable_mockModule('child_process', () => ({
  exec: jest.fn()
}));

jest.unstable_mockModule('log4js', () => ({
  default: {
    getLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

const { GradleExtractor } = await import('../../src/extractors/gradleExtractor.js');

describe('GradleExtractor', () => {
  let extractor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockReset();
    mockExistsSync.mockReset();
    mockExecPromise.mockReset();
    extractor = new GradleExtractor(false);
  });

  describe('extractDependencies', () => {
    it('should extract dependencies from gradle dependencies command output', async () => {
      // Mock setup
      mockExistsSync.mockReturnValue(true); // build.gradle exists
      
      const gradleOutput = `
        Root project 'test-project'

        compileClasspath - Compile classpath for compilation 'main'.
        +--- org.springframework:spring-core:5.3.21
        +--- org.hibernate:hibernate-core:5.6.9.Final
        \\--- org.apache.commons:commons-lang3:3.12.0
      `;
      
      mockExecPromise.mockResolvedValue({ stdout: gradleOutput, stderr: '' });

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');      // Verify
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        projectType: 'GRADLE',
        projectPath: 'src\\build.gradle',
        dependencyName: 'org.springframework:spring-core',
        dependencyVersion: '5.3.21',
        isDev: false
      });
      expect(result[1]).toEqual({
        projectType: 'GRADLE',
        projectPath: 'src\\build.gradle',
        dependencyName: 'org.hibernate:hibernate-core',
        dependencyVersion: '5.6.9.Final',
        isDev: false
      });
      expect(result[2]).toEqual({
        projectType: 'GRADLE',
        projectPath: 'src\\build.gradle',
        dependencyName: 'org.apache.commons:commons-lang3',
        dependencyVersion: '3.12.0',
        isDev: false
      });
    });

    it('should use build.gradle.kts when build.gradle does not exist', async () => {
      // Mock setup
      mockExistsSync
        .mockReturnValueOnce(false) // build.gradle does not exist
        .mockReturnValueOnce(true);  // build.gradle.kts exists
      
      const gradleOutput = `
        compileClasspath - Compile classpath for compilation 'main'.
        +--- org.jetbrains.kotlin:kotlin-stdlib:1.7.0
      `;
      
      mockExecPromise.mockResolvedValue({ stdout: gradleOutput, stderr: '' });

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');      // Verify
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        projectType: 'GRADLE',
        projectPath: 'src\\build.gradle.kts',
        dependencyName: 'org.jetbrains.kotlin:kotlin-stdlib',
        dependencyVersion: '1.7.0',
        isDev: false
      });
    });

    it('should return empty array when no gradle files exist', async () => {
      // Mock setup
      mockExistsSync
        .mockReturnValueOnce(false) // build.gradle does not exist
        .mockReturnValueOnce(false); // build.gradle.kts does not exist

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toEqual([]);
      expect(mockExecPromise).not.toHaveBeenCalled();
    });

    it('should fallback to file parsing when gradle command fails', async () => {
      // Mock setup
      mockExistsSync.mockReturnValue(true); // build.gradle exists
      mockExecPromise.mockRejectedValue(new Error('Gradle command failed'));
        const gradleFileContent = `
        dependencies {
            implementation 'org.springframework:spring-boot:2.7.0'
            api 'org.hibernate:hibernate-core:5.6.9.Final'
            testImplementation 'junit:junit:4.13.2'
        }
      `;
      
      mockReadFile.mockResolvedValue(gradleFileContent);

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');      // Verify
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        projectType: 'GRADLE',
        projectPath: 'src\\build.gradle',
        dependencyName: 'org.springframework:spring-boot',
        dependencyVersion: '2.7.0',
        isDev: false
      });
      expect(result[1]).toEqual({
        projectType: 'GRADLE',
        projectPath: 'src\\build.gradle',
        dependencyName: 'org.hibernate:hibernate-core',
        dependencyVersion: '5.6.9.Final',
        isDev: false
      });
      expect(result[2]).toEqual({
        projectType: 'GRADLE',
        projectPath: 'src\\build.gradle',
        dependencyName: 'junit:junit',
        dependencyVersion: '4.13.2',
        isDev: true
      });
    });

    it('should handle empty gradle dependencies output', async () => {
      // Mock setup
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockResolvedValue({ stdout: 'No dependencies', stderr: '' });

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toEqual([]);
    });

    it('should handle file read error gracefully', async () => {
      // Mock setup
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockRejectedValue(new Error('Gradle command failed'));
      mockReadFile.mockRejectedValue(new Error('File read error'));

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toEqual([]);
    });

    it('should handle version strings with parentheses', async () => {
      // Mock setup
      mockExistsSync.mockReturnValue(true);
      
      const gradleOutput = `
        compileClasspath - Compile classpath for compilation 'main'.
        +--- org.springframework:spring-core:5.3.21 (*)
        +--- org.hibernate:hibernate-core:5.6.9.Final (c)
      `;
      
      mockExecPromise.mockResolvedValue({ stdout: gradleOutput, stderr: '' });

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toHaveLength(2);
      expect(result[0].dependencyVersion).toBe('5.3.21');
      expect(result[1].dependencyVersion).toBe('5.6.9.Final');
    });
  });
});
