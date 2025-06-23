import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import log4js from 'log4js';

const logger = log4js.getLogger('composerExtractor');

/**
 * Composer（PHP）プロジェクトの依存関係抽出クラス
 */
export class ComposerExtractor {
  /**
   * コンストラクタ
   * @param {boolean} debug - デバッグモードフラグ
   */
  constructor(debug = false) {
    this.debug = debug;
  }

  /**
   * Composer プロジェクトから依存関係を抽出する
   * @param {string} projectPath - composer.jsonが存在するディレクトリパス
   * @param {string} projectRelativePath - リポジトリルートからの相対パス
   * @returns {Promise<Array<Object>>} - 抽出された依存関係のリスト
   */
  async extractDependencies(projectPath, projectRelativePath) {
    logger.info(`Composer依存関係を抽出中: ${projectPath}`);
    const dependencies = [];
    // composer.json, composer.lockのパスを関数先頭で宣言
    const composerJsonPath = path.join(projectPath, 'composer.json');
    const composerLockPath = path.join(projectPath, 'composer.lock');
    // projectPathForCsvも関数先頭で宣言
    const projectPathForCsv = path.join(
      path.dirname(projectRelativePath),
      'composer.json'
    );
    try {
      if (!existsSync(composerJsonPath)) {
        logger.warn('composer.jsonが見つかりません');
        return [];
      }
      // composer show --format=json をstreamで実行
      let stdout = '';
      let stderr = '';
      await new Promise((resolve, reject) => {
        const proc = spawn('composer', ['show', '--format=json'], { cwd: projectPath, shell: true });
        proc.stdout.on('data', (data) => {
          logger.info(`composer標準出力: ${data.toString()}`);
          stdout += data.toString();
        });
        proc.stderr.on('data', (data) => {
          logger.warn(`composer標準エラー: ${data.toString()}`);
          stderr += data.toString();
        });
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            // close時はrejectせず、catchでstderrを参照できるようにする
            const err = new Error(`composerコマンドが異常終了しました (exit code: ${code})`);
            err.stderr = stderr;
            reject(err);
          }
        });
        proc.on('error', (err) => {
          err.stderr = stderr;
          reject(err);
        });
      });
      // JSON出力をパース
      const showData = JSON.parse(stdout);
      if (showData.installed && Array.isArray(showData.installed)) {
        for (const pkg of showData.installed) {
          dependencies.push({
            projectType: 'COMPOSER',
            projectPath: projectPathForCsv,
            dependencyName: pkg.name,
            dependencyVersion: pkg.version || 'unknown',
            isDev: false
          });
        }
        logger.info(`composer showから${dependencies.length}の依存関係を抽出しました`);
        return dependencies;
      }
      
    } catch (execError) {
      logger.error(`composer showコマンド実行エラー: ${execError.message}`);
      if (execError.stderr) {
        logger.error(`composer showコマンド標準エラー出力: ${execError.stderr}`);
      }
      logger.warn('composer.jsonおよびcomposer.lockから依存関係を抽出します');
    }
      // composer.lockからの抽出を試みる
    if (existsSync(composerLockPath)) {
      try {
        const lockContent = await readFile(composerLockPath, 'utf8');
        const lockData = JSON.parse(lockContent);
        
        if (lockData.packages && Array.isArray(lockData.packages)) {
          for (const pkg of lockData.packages) {
            dependencies.push({
              projectType: 'COMPOSER',
              projectPath: projectPathForCsv,
              dependencyName: pkg.name,
              dependencyVersion: pkg.version || 'unknown',
              isDev: false
            });
          }
        }
        
        if (dependencies.length > 0) {
          logger.info(`composer.lockから${dependencies.length}の依存関係を抽出しました`);
          return dependencies;
        }
      } catch (lockError) {
        logger.error(`composer.lock解析エラー: ${lockError.message}`);
      }
    }
      // composer.jsonからの抽出を試みる
    try {
      const jsonContent = await readFile(composerJsonPath, 'utf8');
      const composerData = JSON.parse(jsonContent);
      
      // 通常の依存関係
      if (composerData.require) {
        for (const [name, version] of Object.entries(composerData.require)) {
          // PHPバージョン依存は除外
          if (name !== 'php') {
            dependencies.push({
              projectType: 'COMPOSER',
              projectPath: projectPathForCsv,
              dependencyName: name,
              dependencyVersion: version,
              isDev: false
            });
          }
        }
      }
      
      // 開発依存関係
      if (composerData['require-dev']) {
        for (const [name, version] of Object.entries(composerData['require-dev'])) {
          dependencies.push({
            projectType: 'COMPOSER',
            projectPath: projectPathForCsv,
            dependencyName: name,
            dependencyVersion: version,
            isDev: true
          });
        }
      }
      
    } catch (jsonError) {
      logger.error(`composer.json解析エラー: ${jsonError.message}`);
    }
    
    logger.info(`Composerプロジェクトから${dependencies.length}の依存関係を抽出しました`);
    return dependencies;
    
  } catch (error) {
    logger.error(`Composer依存関係抽出エラー: ${error.message}`);
    return [];
  }
  /**
   * Composer プロジェクトから依存関係を抽出する（タイムアウト付き）
   * @param {string} projectPath
   * @param {string} projectRelativePath
   * @param {number} timeoutMs タイムアウト（ミリ秒）デフォルト60000ms
   * @returns {Promise<Array<Object>>}
   */
  async extractDependenciesWithTimeout(projectPath, projectRelativePath, timeoutMs = 60000) {
    return Promise.race([
      this.extractDependencies(projectPath, projectRelativePath),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ComposerExtractor: タイムアウト（60秒）')), timeoutMs))
    ]);
  }
}

export default ComposerExtractor;
