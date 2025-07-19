import { existsSync } from 'fs';
import * as path from 'path';
import { execa } from 'execa';
import log4js from 'log4js';

const logger = log4js.getLogger('gradleExtractor');

/**
 * Gradle（Java）プロジェクトの依存関係抽出クラス
 */
export class GradleExtractor {
  /**
   * コンストラクタ
   * @param {boolean} debug - デバッグモードフラグ
   */
  constructor(debug = false) {
    this.debug = debug;
  }

  /**
   * Gradle プロジェクトから依存関係を抽出する
   * @param {string} projectPath - build.gradleが存在するディレクトリパス
   * @param {string} projectRelativePath - リポジトリルートからの相対パス
   * @returns {Promise<Array<Object>>} - 抽出された依存関係のリスト
   */
  async extractDependencies(projectPath, projectRelativePath) {
    logger.info(`Gradle依存関係を抽出中: ${projectPath}`);
    const dependencies = [];
    try {
      // build.gradle または build.gradle.kts のパスを確認
      let gradleFile = 'build.gradle';
      if (!existsSync(path.join(projectPath, gradleFile))) {
        gradleFile = 'build.gradle.kts';
        if (!existsSync(path.join(projectPath, gradleFile))) {
          logger.error(`Gradleファイルが見つかりません: ${projectPath}`);
          return [];
        }
      }
      // gradle buildを実行
      try {
        logger.info('gradle buildを実行して依存関係をインストールします');
        const { stdout, stderr, exitCode } = await execa('gradle', ['build', '--console=plain'], {
          cwd: projectPath,
          shell: true,
          timeout: 120000 // 120秒
        });
        if (stderr) logger.warn(`gradle build 標準エラー: ${stderr}`);
        if (this.debug && stdout) logger.info(`gradle build 標準出力: ${stdout}`);
        if (exitCode !== 0) logger.warn(`gradle buildが異常終了しました (exit code: ${exitCode})`);
      } catch (installError) {
        if (installError.timedOut) {
          logger.warn(`gradle buildコマンドがタイムアウトしました: ${installError.message}`);
        } else {
          logger.error(`gradle build実行エラー: ${installError.message}`);
        }
        
        // インストール失敗時も続行
      }
      // gradle dependencies コマンドをexecaで実行
      let stdout = '';
      try {
        const result = await execa('gradle', ['dependencies', '--console=plain'], {
          cwd: projectPath,
          shell: true,
          timeout: 1200000 // 120秒に延長
        });
        if (result.stderr) logger.warn(`gradle標準エラー: ${result.stderr}`);
        if (typeof result.stdout !== 'undefined') {
          if (this.debug && stdout) logger.info(`gradle標準出力: ${result.stdout}`);
          stdout = result.stdout;
        } else {
          logger.warn('gradleコマンドの標準出力が取得できませんでした');
        }
        if (result.exitCode !== 0) throw new Error(`gradleコマンドが異常終了しました (exit code: ${result.exitCode})`);
      } catch (execError) {
        if (execError.timedOut) {
          logger.warn(`gradleコマンドがタイムアウトしました: ${execError.message}`);
        } else {
          logger.error(`gradleコマンド実行エラー: ${execError.message}`);
        }
        // タイムアウト・その他エラー時もstdoutを空文字列に
        stdout = '';
      }
      // プロジェクトパスをCSV用に整形
      const projectPathForCsv = path.join(
        path.dirname(projectRelativePath), 
        gradleFile
      );
      // 出力を解析して依存関係を抽出
      let depLines = this._parseGradleDependenciesOutput(stdout);
      if (!Array.isArray(depLines)) depLines = [];
      for (const dep of depLines) {
        if (!dep) continue;
        const group = dep.group || 'unknown';
        const name = dep.name || 'unknown';
        const version = dep.version || 'unknown';
        dependencies.push({
          projectType: 'GRADLE',
          projectPath: projectPathForCsv,
          dependencyName: `${group}:${name}`,
          dependencyVersion: version,
          isDev: !!dep.configuration && (dep.configuration === 'testCompileClasspath' || dep.configuration === 'testImplementation')
        });
      }
    } catch (error) {
      logger.error(`Gradle依存関係抽出エラー: ${error.message}`);
      return [];
    }
    return dependencies;
  }

  /**
   * gradle dependencies コマンドの出力を解析する
   * @private
   */
  _parseGradleDependenciesOutput(output) {
    const dependencies = [];
    const lines = output.split('\n');
    
    // 依存関係行を判別するための正規表現
    const dependencyRegex = /[+\\]+--- (.+):(.+):(.+)$/;
    
    for (const line of lines) {
      const match = line.trim().match(dependencyRegex);      if (match) {
        dependencies.push({
          group: match[1],
          name: match[2],
          version: match[3].replace(/\s*\([^)]*\)\s*|\s*\*\s*/g, '').trim() // バージョン文字列からかっこや*を削除
        });
      }
    }
    
    return dependencies;
  }
  /**
   * build.gradleファイルを直接解析する
   * @private
   */
  _parseGradleFile(content) {
    const dependencies = [];
    
    // 依存関係宣言を抽出するための正規表現
    const dependencyRegex = /(implementation|api|compile|testImplementation|testCompile)\s+['"](.+?):(.+?):(.+?)['"]/g;
    
    let match;
    while ((match = dependencyRegex.exec(content)) !== null) {
      dependencies.push({
        name: `${match[2]}:${match[3]}`,
        version: match[4],
        type: match[1]
      });
    }
    
    return dependencies;
  }
}

export default GradleExtractor;
