import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { execa } from 'execa';
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

    try {
      // composer.jsonのパス
      const composerJsonPath = path.join(projectPath, 'composer.json');
      
      // composer.lockのパス
      const composerLockPath = path.join(projectPath, 'composer.lock');
      
      // vendor配下のcomposer.jsonは抽出対象から除外
      if (projectPath.includes('/vendor/') || projectPath.includes('\\vendor\\')) {
        logger.info('vendor配下のcomposer.jsonは抽出対象外のためスキップします');
        // スキップ時は空配列に加え、専用プロパティを付与
        const skipResult = [];
        skipResult._skip = true;
        return skipResult;
      }
      // composer installを実行
      try {
        logger.info('composer installを実行して依存関係をインストールします');
        const { stdout, stderr, exitCode } = await execa('composer', ['install', '--no-interaction', '--no-progress', '--ignore-platform-reqs', '--ignore-platform-req=ext-xmlwriter', '--ignore-platform-req=ext-tokenizer'], {
          cwd: projectPath,
          shell: true,
          timeout: 60000 // 60秒
        });
        if (stderr) logger.warn(`composer install 標準エラー: ${stderr}`);
        if (stdout) logger.info(`composer install 標準出力: ${stdout}`);
        if (exitCode !== 0) logger.warn(`composer installが異常終了しました (exit code: ${exitCode})`);
      } catch (installError) {
        logger.error(`composer install実行エラー: ${installError.message}`);
      }
      if (!existsSync(composerJsonPath)) {
        logger.warn('composer.jsonが見つかりません');
        return [];
      }
      // composer show --format=json をexecaで実行
      let showData;
      const projectPathForCsv = path.join(
        path.dirname(projectRelativePath),
        'composer.json'
      );
      try {
        const { stdout, stderr, exitCode } = await execa('composer', ['show', '--format=json'], {
          cwd: projectPath,
          shell: true,
          timeout: 60000 // 60秒に延長
        });
        if (stderr) logger.warn(`composer標準エラー: ${stderr}`);
        if (this.debug && stdout) logger.debug(`composer標準出力: ${stdout}`);
        if (exitCode !== 0) throw new Error(`composerコマンドが異常終了しました (exit code: ${exitCode})`);
        showData = JSON.parse(stdout);
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
        if (execError.timedOut) {
          logger.warn(`composer showコマンドがタイムアウトしました: ${execError.message}`);
        } else {
          logger.error(`composer showコマンド実行エラー: ${execError.message}`);
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
  }
}

export default ComposerExtractor;
