import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
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
      // gradle dependencies コマンドをstreamで実行
      await new Promise((resolve, reject) => {
        const proc = spawn('gradle', ['dependencies', '--console=plain'], { cwd: projectPath, shell: true });
        proc.stdout.on('data', (data) => {
          logger.info(`gradle標準出力: ${data.toString()}`);
        });
        proc.stderr.on('data', (data) => {
          logger.warn(`gradle標準エラー: ${data.toString()}`);
        });
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`gradleコマンドが異常終了しました (exit code: ${code})`));
          }
        });
        proc.on('error', (err) => {
          reject(err);
        });
      });
      
      // build.gradle または build.gradle.kts のパスを確認
      let gradleFile = 'build.gradle';
      if (!existsSync(path.join(projectPath, gradleFile))) {
        gradleFile = 'build.gradle.kts';
        if (!existsSync(path.join(projectPath, gradleFile))) {
          logger.error(`Gradleファイルが見つかりません: ${projectPath}`);
          return [];
        }
      }
      
      // プロジェクトパスをCSV用に整形
      const projectPathForCsv = path.join(
        path.dirname(projectRelativePath), 
        gradleFile
      );
      
      // 出力を解析して依存関係を抽出
      const depLines = this._parseGradleDependenciesOutput(stdout);
        for (const dep of depLines) {
        dependencies.push({
          projectType: 'GRADLE',
          projectPath: projectPathForCsv,
          dependencyName: `${dep.group}:${dep.name}`,
          dependencyVersion: dep.version || 'unknown',
          isDev: dep.configuration === 'testCompileClasspath' || dep.configuration === 'testImplementation'
        });
      }
      
    } catch (error) {
      logger.error(`Gradle依存関係抽出エラー: ${error.message}`);
      return [];
    }
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
