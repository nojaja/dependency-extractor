import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import log4js from 'log4js';

const execPromise = promisify(exec);
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
      
      // プロジェクトパスをCSV用に整形
      const projectPathForCsv = path.join(
        path.dirname(projectRelativePath), 
        gradleFile
      );
      
      try {
        // 'gradle dependencies' コマンドを実行
        logger.info(`gradle dependenciesコマンドを実行中: ${projectPath}`);
        
        const { stdout } = await execPromise(
          'gradle dependencies --configuration compileClasspath',
          { cwd: projectPath }
        );
        
        if (this.debug) logger.debug(`gradle dependencies 実行出力:\n${stdout}`);
        
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
        
      } catch (execError) {
        logger.error(`gradleコマンド実行エラー: ${execError.message}`);
        
        // コマンド実行エラー時はbuild.gradleファイルから直接抽出を試みる
        logger.info(`build.gradleファイルから直接解析を試みます: ${projectPath}`);
          try {
          const gradleContent = await readFile(
            path.join(projectPath, gradleFile), 
            'utf8'
          );
          
          // シンプルな正規表現ベースの解析
          const depList = this._parseGradleFile(gradleContent);
            for (const dep of depList) {
            dependencies.push({
              projectType: 'GRADLE',
              projectPath: projectPathForCsv,
              dependencyName: dep.name,
              dependencyVersion: dep.version || 'unknown',
              isDev: dep.type === 'testImplementation' || dep.type === 'testCompile'
            });
          }
          
        } catch (fileError) {
          logger.error(`Gradleファイル読み込みエラー: ${fileError.message}`);
        }
      }
      
      logger.info(`Gradleプロジェクトから${dependencies.length}の依存関係を抽出しました`);
      return dependencies;
      
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
