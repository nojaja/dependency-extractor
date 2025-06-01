module.exports = {
  // ESMサポートのため
  preset: null,
  
  // テストファイルのマッチパターン
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  
  // node_modulesを除外
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  
  // モジュール解決
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  // カバレッジ設定
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/index.js'
  ],
  
  // テスト環境
  testEnvironment: 'node',
  
  // トランスフォーム設定（ESMをそのまま使用）
  transform: {}
};
