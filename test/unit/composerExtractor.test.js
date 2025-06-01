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
      debug: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

const { ComposerExtractor } = await import('../../src/extractors/composerExtractor.js');

describe('ComposerExtractor', () => {
  let extractor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockReset();
    mockExistsSync.mockReset();
    mockExecPromise.mockReset();
    extractor = new ComposerExtractor(false);
  });

  describe('extractDependencies', () => {
    it('should return empty array when composer.json does not exist', async () => {
      // Mock setup
      mockExistsSync.mockReturnValue(false); // composer.json does not exist

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toEqual([]);
      expect(mockExecPromise).not.toHaveBeenCalled();
    });

    it('should extract dependencies from composer show command output', async () => {
      // Mock setup
      mockExistsSync.mockReturnValue(true); // composer.json exists
      
      const composerShowOutput = JSON.stringify({
        installed: [
          {
            name: 'symfony/console',
            version: '5.4.0'
          },
          {
            name: 'doctrine/orm',
            version: '2.13.0'
          }
        ]
      });
      
      mockExecPromise.mockResolvedValue({ stdout: composerShowOutput, stderr: '' });

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        projectType: 'COMPOSER',
        projectPath: 'src\\composer.json',
        dependencyName: 'symfony/console',
        dependencyVersion: '5.4.0',
        isDev: false
      });
      expect(result[1]).toEqual({
        projectType: 'COMPOSER',
        projectPath: 'src\\composer.json',
        dependencyName: 'doctrine/orm',
        dependencyVersion: '2.13.0',
        isDev: false
      });
    });

    it('should fallback to composer.lock when composer show fails', async () => {
      // Mock setup
      mockExistsSync
        .mockReturnValueOnce(true)  // composer.json exists
        .mockReturnValueOnce(true); // composer.lock exists
      
      mockExecPromise.mockRejectedValue(new Error('Composer command failed'));
      
      const composerLockContent = JSON.stringify({
        packages: [
          {
            name: 'guzzlehttp/guzzle',
            version: '7.4.5'
          },
          {
            name: 'psr/log',
            version: '3.0.0'
          }
        ]
      });
      
      mockReadFile.mockResolvedValue(composerLockContent);

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        projectType: 'COMPOSER',
        projectPath: 'src\\composer.json',
        dependencyName: 'guzzlehttp/guzzle',
        dependencyVersion: '7.4.5',
        isDev: false
      });
      expect(result[1]).toEqual({
        projectType: 'COMPOSER',
        projectPath: 'src\\composer.json',
        dependencyName: 'psr/log',
        dependencyVersion: '3.0.0',
        isDev: false
      });
    });

    it('should fallback to composer.json when both composer show and lock fail', async () => {
      // Mock setup
      mockExistsSync
        .mockReturnValueOnce(true)   // composer.json exists
        .mockReturnValueOnce(false); // composer.lock does not exist
      
      mockExecPromise.mockRejectedValue(new Error('Composer command failed'));
      
      const composerJsonContent = JSON.stringify({
        require: {
          'php': '^8.1',
          'laravel/framework': '^9.0',
          'symfony/yaml': '^5.4'
        },
        'require-dev': {
          'phpunit/phpunit': '^9.5',
          'fakerphp/faker': '^1.20'
        }
      });
      
      mockReadFile.mockResolvedValue(composerJsonContent);

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toHaveLength(4); // php is excluded, so 2 from require + 2 from require-dev
      expect(result[0]).toEqual({
        projectType: 'COMPOSER',
        projectPath: 'src\\composer.json',
        dependencyName: 'laravel/framework',
        dependencyVersion: '^9.0',
        isDev: false
      });
      expect(result[1]).toEqual({
        projectType: 'COMPOSER',
        projectPath: 'src\\composer.json',
        dependencyName: 'symfony/yaml',
        dependencyVersion: '^5.4',
        isDev: false
      });
      expect(result[2]).toEqual({
        projectType: 'COMPOSER',
        projectPath: 'src\\composer.json',
        dependencyName: 'phpunit/phpunit',
        dependencyVersion: '^9.5',
        isDev: true
      });
      expect(result[3]).toEqual({
        projectType: 'COMPOSER',
        projectPath: 'src\\composer.json',
        dependencyName: 'fakerphp/faker',
        dependencyVersion: '^1.20',
        isDev: true
      });
    });

    it('should handle empty composer show output', async () => {
      // Mock setup
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockResolvedValue({ stdout: '{"installed": []}', stderr: '' });

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toEqual([]);
    });

    it('should handle file read error gracefully', async () => {
      // Mock setup
      mockExistsSync
        .mockReturnValueOnce(true)   // composer.json exists
        .mockReturnValueOnce(false); // composer.lock does not exist
      
      mockExecPromise.mockRejectedValue(new Error('Composer command failed'));
      mockReadFile.mockRejectedValue(new Error('File read error'));

      // Execute
      const result = await extractor.extractDependencies('/test/project', 'src/main');

      // Verify
      expect(result).toEqual([]);
    });
  });
});
