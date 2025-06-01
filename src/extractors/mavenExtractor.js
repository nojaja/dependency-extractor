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
   * @returns {Promise<Array<Object>>} - 抽出された依存関係のリスト
   */
  async extractDependencies(projectPath, projectRelativePath) {
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
          await execPromise(
            `mvn help:effective-pom -Doutput="${effectivePomPath}"`,
            { cwd: projectPath }
          );
          
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
}

export default MavenExtractor;
