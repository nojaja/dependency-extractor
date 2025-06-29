import { readFile } from 'fs/promises';
import { existsSync, unlinkSync } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { XMLParser } from 'fast-xml-parser';
import log4js from 'log4js';

const execPromise = promisify(exec);
const logger = log4js.getLogger('mavenExtractor');

/**
 * Maven（Java）プロジェクトの依存関係抽出クラス
 */
export class MavenExtractor {
  /**
   * コンストラクタ
   * @param {boolean} debug - デバッグモードフラグ
   */
  constructor(debug = false) {
    this.debug = debug;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      parseAttributeValue: true,
      allowBooleanAttributes: true
    });
  }

  /**
   * Maven プロジェクトから依存関係を抽出する
   * @param {string} projectPath - pom.xmlが存在するディレクトリパス
   * @param {string} projectRelativePath - リポジトリルートからの相対パス
   * @param {Object} [options] - procRefでプロセス参照を受け取る
   * @returns {Promise<Array<Object>>} - 抽出された依存関係のリスト
   */
  async extractDependencies(projectPath, projectRelativePath, options = {}) {
    logger.info(`Maven依存関係を抽出中: ${projectPath}`);
    const dependencies = [];

    try {
      // pom.xmlのパス
      const pomPath = path.join(projectPath, 'pom.xml');
      
      // effective-pomを生成するためのパス
      const effectivePomPath = path.join(projectPath, 'effective-pom.xml');
      
      try {        // まず通常のpom.xmlから基本情報を読み取る
        const pomContent = await readFile(pomPath, 'utf8');
        const pomData = this.xmlParser.parse(pomContent);
        
        // mvn help:effective-pomコマンドを実行
        logger.info(`effective-pomを生成中: ${projectPath}`);
        try {
          // streamで標準出力・標準エラーをloggerに出力
          const { spawn } = await import('child_process');
          let stderr = '';
          const mvnProc = spawn('mvn', ['help:effective-pom', `-Doutput=${effectivePomPath}`], { cwd: projectPath, shell: true });
          if (options.procRef) options.procRef.proc = mvnProc;

          await new Promise((resolve, reject) => {
            mvnProc.stdout.on('data', (data) => {
              logger.info(`mvn標準出力: ${data.toString()}`);
            });
            mvnProc.stderr.on('data', (data) => {
              logger.warn(`mvn標準エラー: ${data.toString()}`);
              stderr += data.toString();
            });
            mvnProc.on('close', (code) => {
              if (code === 0) {
                resolve();
              } else {
                const err = new Error(`mvnコマンドが異常終了しました (exit code: ${code})`);
                err.stderr = stderr;
                reject(err);
              }
            });
            mvnProc.on('error', (err) => {
              err.stderr = stderr;
              reject(err);
            });
          });
          
          if (this.debug) logger.debug(`effective-pom生成成功: ${effectivePomPath}`);
            // effective-pomを読み込む
          const effectivePomContent = await readFile(effectivePomPath, 'utf8');
          const effectivePomData = this.xmlParser.parse(effectivePomContent);
          
          // プロジェクトデータ取得
          const projectData = effectivePomData.project;
          
          if (projectData && projectData.dependencies && projectData.dependencies.dependency) {
            const projectPathForCsv = path.join(
              path.dirname(projectRelativePath), 
              'pom.xml'
            );
              // 依存関係リストを取得
            const deps = Array.isArray(projectData.dependencies.dependency) 
              ? projectData.dependencies.dependency 
              : [projectData.dependencies.dependency];
            
            for (const dep of deps) {
              dependencies.push({
                projectType: 'MAVEN',
                projectPath: projectPathForCsv,
                dependencyName: `${dep.groupId}:${dep.artifactId}`,
                dependencyVersion: dep.version || 'unknown',
                isDev: dep.scope === 'test'
              });
            }
          }
              // 一時ファイルを削除
          try {
            unlinkSync(effectivePomPath);
          } catch (error) {
            logger.warn(`effective-pomファイル削除エラー: ${error.message}`);
          }
          
        } catch (execError) {
          logger.error(`mvnコマンド実行エラー: ${execError.message}`);
          if (execError.stderr) {
            logger.error(`mvnコマンド標準エラー出力: ${execError.stderr}`);
          }
          logger.warn('Maven実行エラー。基本的なpom.xmlのみから依存関係を抽出します');
          
          // effective-pom生成に失敗した場合は、通常のpom.xmlから依存関係を抽出
          if (pomData.project && pomData.project.dependencies && pomData.project.dependencies.dependency) {
            const projectPathForCsv = path.join(
              path.dirname(projectRelativePath), 
              'pom.xml'
            );
            
            const deps = Array.isArray(pomData.project.dependencies.dependency) 
              ? pomData.project.dependencies.dependency 
              : [pomData.project.dependencies.dependency];
              for (const dep of deps) {
              dependencies.push({
                projectType: 'MAVEN',
                projectPath: projectPathForCsv,
                dependencyName: `${dep.groupId}:${dep.artifactId}`,
                dependencyVersion: dep.version || 'unknown',
                isDev: dep.scope === 'test'
              });
            }
          }
        }
        
      } catch (fileError) {
        logger.error(`pom.xmlの読み込みエラー: ${fileError.message}`);
        return [];
      }
      
      logger.info(`Mavenプロジェクトから${dependencies.length}の依存関係を抽出しました`);
      return dependencies;
    } catch (error) {
      logger.error(`Maven依存関係抽出エラー: ${error.message}`);
      return [];
    }
  }

  /**
   * Maven プロジェクトから依存関係を抽出する（タイムアウト付き）
   * @param {string} projectPath
   * @param {string} projectRelativePath
   * @param {number} timeoutMs タイムアウト（ミリ秒）デフォルト60000ms
   * @returns {Promise<Array<Object>>}
   */
  async extractDependenciesWithTimeout(projectPath, projectRelativePath, timeoutMs = 60000) {
    const procRef = { proc: null };
    let timeoutId;
    return new Promise((resolve, reject) => {
      let finished = false;
      timeoutId = setTimeout(() => {
        finished = true;
        if (procRef.proc) {
          procRef.proc.kill('SIGKILL');
        }
        reject(new Error('MavenExtractor: タイムアウト(60秒)'));
      }, timeoutMs);
      this.extractDependencies(projectPath, projectRelativePath, { procRef })
        .then((result) => {
          if (!finished) {
            clearTimeout(timeoutId);
            resolve(result);
          }
        })
        .catch((err) => {
          if (!finished) {
            clearTimeout(timeoutId);
            reject(err);
          }
        });
    });
  }
}

export default MavenExtractor;
