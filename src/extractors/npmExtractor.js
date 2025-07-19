import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import log4js from 'log4js';
import { execa } from 'execa';

const logger = log4js.getLogger('npmExtractor');

/**
 * NPM（Node.js）プロジェクトの依存関係抽出クラス
 */
export class NpmExtractor {
  /**
   * コンストラクタ
   * @param {boolean} debug - デバッグモードフラグ
   */
  constructor(debug = false) {
    this.debug = debug;
  }

  /**
   * package.jsonから依存関係を抽出する
   * @param {string} projectPath - package.jsonが存在するディレクトリパス
   * @param {string} projectRelativePath - リポジトリルートからの相対パス
   * @returns {Promise<Array<Object>>} - 抽出された依存関係のリスト
   */
  async extractDependencies(projectPath, projectRelativePath) {
    logger.info(`NPM依存関係を抽出中: ${projectPath}`);
    const dependencies = [];
    try {
      // node_modules配下のpackage.jsonは抽出対象から除外
      if (projectPath.includes('/node_modules/') || projectPath.includes('\\node_modules\\')) {
        logger.info('node_modules配下のpackage.jsonは抽出対象外のためスキップします');
        const skipResult = [];
        skipResult._skip = true;
        return skipResult;
      }
      // package.jsonのパス
      const packageJsonPath = path.join(projectPath, 'package.json');
      // lockFilePathの定義
      const lockFilePath = path.join(projectPath, 'package-lock.json');
      // package.jsonの存在確認
      if (!existsSync(packageJsonPath)) {
        logger.warn('package.jsonが見つかりません');
        return [];
      }
      // package-lock.jsonの存在確認、なければnpm installで作成
      if (!existsSync(lockFilePath)) {
        // package.jsonの事前検証
        let packageJsonValid = true;
        try {
          const jsonContent = await readFile(packageJsonPath, 'utf8');
          if (!jsonContent || jsonContent.trim() === '') {
            logger.warn('package.jsonが空です');
            packageJsonValid = false;
          } else {
            JSON.parse(jsonContent);
          }
        } catch (jsonError) {
          logger.error(`package.json解析エラー: ${jsonError.message}`);
          packageJsonValid = false;
        }
        // package.jsonが不正な場合は依存抽出を中断
        if (!packageJsonValid) {
          logger.warn('package.jsonが不正なためnpm installをスキップし、依存抽出を中断します');
          return [];
        }
        // 依存関係インストール（npm install）
        try {
          logger.info('npm installを実行して依存関係をインストールします');
          const { stdout, stderr, exitCode } = await execa('npm', ['install', '--no-audit', '--no-fund'], {
            cwd: projectPath,
            shell: true,
            timeout: 60000 // 60秒
          });
          if (stderr) logger.warn(`npm install 標準エラー: ${stderr}`);
          if (this.debug && stdout) logger.debug(`npm install 標準出力: ${stdout}`);
          if (exitCode !== 0) logger.warn(`npm installが異常終了しました (exit code: ${exitCode})`);
        } catch (installError) {
          logger.error(`npm install実行エラー: ${installError.message}`);
          // インストール失敗時も続行
        }
        // npm ls --all --json をexecaで実行
        // try {
        //   const { stdout, stderr, exitCode } = await execa('npm', ['ls', '--all', '--json'], {
        //     cwd: projectPath,
        //     shell: true,
        //     timeout: 10000
        //   });
        //   if (stderr) logger.warn(`npm標準エラー: ${stderr}`);
        //   if (this.debug && stdout) logger.debug(`npm標準出力: ${stdout}`);
        //   // exitCode !== 0でもstdoutがあればパース
        //   if (stdout) {
        //     try {
        //       const npmData = JSON.parse(stdout);
        //       // ...依存抽出ロジック...
        //     } catch (jsonError) {
        //       logger.warn(`npm ls 標準出力のJSONパースに失敗しました: ${jsonError.message}`);
        //       logger.warn(`npm ls 標準出力: ${stdout}`);
        //       // パース失敗時もフォールバック処理を継続
        //     }
        //   }
        //   // ...lockFilePathの参照は必ず定義済み変数を使う...
        // } catch (execError) {
        //   if (execError.timedOut) {
        //     logger.warn(`npmコマンドがタイムアウトしました: ${execError.message}`);
        //   } else {
        //     logger.error(`npmコマンド実行エラー: ${execError.message}`);
        //   }
        //   // タイムアウト・その他エラー時もフォールバック処理を継続
        // }
      
      }
      // yarn.lockが存在する場合の処理はここに追加できる
      // ただし、yarn.lockは単純なJSONではなく専用のパーサーが必要

      // package-lock.jsonが存在する場合、それから依存関係を取得
      if (existsSync(lockFilePath)) {
        try {
          const lockContent = await readFile(lockFilePath, 'utf8');
          const lockData = JSON.parse(lockContent);
          
          // package-lock.jsonのバージョンによって構造が異なる
          if (lockData.dependencies) {
            // package-lock.json v2 (npm v7+) の形式
            await this._processPackageLockDependencies(
              lockData.dependencies, 
              dependencies,
              projectRelativePath
            );
          } else if (lockData.packages) {
            // package-lock.json v3 (npm v8+) の形式
            await this._processPackageLockV3Dependencies(
              lockData.packages, 
              dependencies,
              projectRelativePath
            );
          }
          
          logger.info(`package-lock.jsonから${dependencies.length}の依存関係を抽出しました`);
          return dependencies;
        } catch (error) {
          logger.error(`package-lock.jsonの解析エラー: ${error.message}`);
          // エラー時はpackage.jsonから取得を試みる
        }
      } else {
        // package.jsonを読み込み
        const packageContent = await readFile(packageJsonPath, 'utf8');
        const packageData = JSON.parse(packageContent);
        
        // package.jsonから依存関係を取得
        if (packageData.dependencies) {
          const projectPathForCsv = path.join(
            path.dirname(projectRelativePath), 
            'package.json'
          );
            for (const [name, version] of Object.entries(packageData.dependencies)) {
            dependencies.push({
              projectType: 'NPM',
              projectPath: projectPathForCsv,
              dependencyName: name,
              dependencyVersion: version,
              isDev: false
            });
          }
        }
        
        // devDependenciesも取得
        if (packageData.devDependencies) {
          const projectPathForCsv = path.join(
            path.dirname(projectRelativePath), 
            'package.json'
          );
          
          for (const [name, version] of Object.entries(packageData.devDependencies)) {
            dependencies.push({
              projectType: 'NPM',
              projectPath: projectPathForCsv,
              dependencyName: name,
              dependencyVersion: version,
              isDev: true
            });
          }
        }
      }
      
      logger.info(`package.jsonから${dependencies.length}の依存関係を抽出しました`);
      return dependencies;
    } catch (error) {
      logger.error(`NPM依存関係抽出エラー: ${error.message}`);
      return [];
    }
  }

  /**
   * package-lock.json (v2) から依存関係を処理する
   * @private
   */
   async _processPackageLockDependencies(dependencies, result, projectRelativePath) {
    const projectPathForCsv = path.join(
      path.dirname(projectRelativePath), 
      'package-lock.json'
    );
    for (const [name, info] of Object.entries(dependencies)) {
      result.push({
        projectType: 'NPM',
        projectPath: projectPathForCsv,
        dependencyName: name,
        dependencyVersion: info.version || 'unknown',
        isDev: !!info.dev
      });
      
        // 再帰的に依存関係を処理
      if (info.dependencies) {
        await this._processPackageLockDependencies(
          info.dependencies, 
          result,
          projectRelativePath
        );
      }
    }
  }
  
  /**
   * package-lock.json (v3) から依存関係を処理する
   * @private
   */  async _processPackageLockV3Dependencies(packages, result, projectRelativePath) {
    const projectPathForCsv = path.join(
      path.dirname(projectRelativePath),
      'package-lock.json'
    );
    
    // ルート以外のパッケージを処理
    for (const [pkgPath, info] of Object.entries(packages)) {
      // ルートパッケージはスキップ
      if (pkgPath === '') continue;
      
      // パッケージ名を取得
      const pkgName = pkgPath.startsWith('node_modules/') 
        ? pkgPath.substring('node_modules/'.length) 
        : pkgPath;
      
      // スコープ付きパッケージの場合は処理
      let name = pkgName;
      if (name.includes('/node_modules/')) {
        name = name.substring(name.lastIndexOf('/node_modules/') + '/node_modules/'.length);
      }
        result.push({
        projectType: 'NPM',
        projectPath: projectPathForCsv,
        dependencyName: name,
        dependencyVersion: info.version || 'unknown',
        isDev: !!info.dev
      });
    }
  }
}

export default NpmExtractor;
