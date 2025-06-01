import { jest } from '@jest/globals';
import path from 'path';

// Create mock functions
const mockReaddir = jest.fn();
const mockStat = jest.fn();
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerError = jest.fn();

// Mock fs modules using unstable_mockModule for ESM compatibility
jest.unstable_mockModule('fs/promises', () => ({
    readdir: mockReaddir,
    stat: mockStat
}));

jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    statSync: mockStatSync
}));

// Mock log4js
jest.unstable_mockModule('log4js', () => ({
    default: {
        configure: jest.fn(),
        getLogger: jest.fn(() => ({
            info: mockLoggerInfo,
            debug: mockLoggerDebug,
            error: mockLoggerError
        }))
    }
}));

// Import after mocking
const { DirWalker } = await import('../../src/utils/dirWalker.js');

describe('DirWalker', () => {
    const mockTargetPath = path.normalize('/mock/target');
    let mockFileCallback;
    let mockErrCallback;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        mockReaddir.mockReset();
        mockStat.mockReset();
        mockExistsSync.mockReset();
        mockStatSync.mockReset();
        mockLoggerInfo.mockReset();
        mockLoggerDebug.mockReset();
        mockLoggerError.mockReset();

        // Create fresh callback mocks
        mockFileCallback = jest.fn();
        mockErrCallback = jest.fn();
    });

    describe('constructor', () => {
        test('should initialize with default debug mode false', () => {
            const walker = new DirWalker();
            expect(walker.debug).toBe(false);
            expect(walker.counter).toBe(0);
        });

        test('should initialize with debug mode true when specified', () => {
            const walker = new DirWalker(true);
            expect(walker.debug).toBe(true);
            expect(walker.counter).toBe(0);
        });
    });

    describe('walk method', () => {
        test('should process single file in directory', async () => {
            // Mock directory with one file
            mockReaddir.mockResolvedValue(['test.txt']);
            mockStat.mockResolvedValue({
                isDirectory: () => false,
                isSymbolicLink: () => false
            });

            const walker = new DirWalker();
            const result = await walker.walk(mockTargetPath, {}, mockFileCallback, mockErrCallback);

            expect(result).toBe(1);
            expect(mockFileCallback).toHaveBeenCalledTimes(1);
            expect(mockFileCallback).toHaveBeenCalledWith('test.txt', {});
            expect(mockErrCallback).not.toHaveBeenCalled();
        });

        test('should process multiple files in directory', async () => {
            mockReaddir.mockResolvedValue(['file1.txt', 'file2.js', 'file3.json']);
            mockStat.mockResolvedValue({
                isDirectory: () => false,
                isSymbolicLink: () => false
            });

            const walker = new DirWalker();
            const result = await walker.walk(mockTargetPath, {}, mockFileCallback, mockErrCallback);

            expect(result).toBe(3);
            expect(mockFileCallback).toHaveBeenCalledTimes(3);
            expect(mockFileCallback).toHaveBeenCalledWith('file1.txt', {});
            expect(mockFileCallback).toHaveBeenCalledWith('file2.js', {});
            expect(mockFileCallback).toHaveBeenCalledWith('file3.json', {});
        });

        test('should recursively process subdirectories', async () => {
            // First call returns directory and file
            mockReaddir
                .mockResolvedValueOnce(['subdir', 'root.txt'])
                .mockResolvedValueOnce(['nested.txt']);

            mockStat
                .mockResolvedValueOnce({
                    isDirectory: () => true,
                    isSymbolicLink: () => false
                })
                .mockResolvedValueOnce({
                    isDirectory: () => false,
                    isSymbolicLink: () => false
                })
                .mockResolvedValueOnce({
                    isDirectory: () => false,
                    isSymbolicLink: () => false
                });

            const walker = new DirWalker();
            const result = await walker.walk(mockTargetPath, {}, mockFileCallback, mockErrCallback);

            expect(result).toBe(2);
            expect(mockFileCallback).toHaveBeenCalledTimes(2);
            expect(mockFileCallback).toHaveBeenCalledWith('root.txt', {});
            expect(mockFileCallback).toHaveBeenCalledWith(path.join('subdir', 'nested.txt'), {});
        });

        test('should skip symbolic links', async () => {
            mockReaddir.mockResolvedValue(['symlink.txt', 'regular.txt']);
            mockStat
                .mockResolvedValueOnce({
                    isDirectory: () => false,
                    isSymbolicLink: () => true
                })
                .mockResolvedValueOnce({
                    isDirectory: () => false,
                    isSymbolicLink: () => false
                });

            const walker = new DirWalker();
            const result = await walker.walk(mockTargetPath, {}, mockFileCallback, mockErrCallback);

            expect(result).toBe(1);
            expect(mockFileCallback).toHaveBeenCalledTimes(1);
            expect(mockFileCallback).toHaveBeenCalledWith('regular.txt', {});
        });

        test('should handle directory read errors', async () => {
            const readError = new Error('Permission denied');
            mockReaddir.mockRejectedValue(readError);

            const walker = new DirWalker();
            const result = await walker.walk(mockTargetPath, {}, mockFileCallback, mockErrCallback);

            expect(result).toBe(0);
            expect(mockErrCallback).toHaveBeenCalledWith(readError);
            expect(mockFileCallback).not.toHaveBeenCalled();
        });
    });
});
