// Triggered via Gitea push webhook → generic-webhook-trigger

pipeline {
    agent none

    triggers {
        GenericTrigger(
            genericVariables: [
                [key: 'ref', value: '$.ref']
            ],
            token: 'Ahahahahahahahahaha',
            causeString: 'Push to $ref',
            printContributedVariables: true,
            printPostContent: false,
            regexpFilterText: '$ref',
            regexpFilterExpression: '^refs/heads/main$'
        )
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timestamps()
        timeout(time: 60, unit: 'MINUTES')
    }

    stages {
        // ────────────────────────────────────────────────────────
        // Stage 1: Build web assets + run tests (once, on Linux)
        // ────────────────────────────────────────────────────────
        stage('Build & Test') {
            agent { label 'linux' }
            steps {
                sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                sh 'export PATH=$HOME/.bun/bin:$PATH && bun run format:check'
                sh 'export PATH=$HOME/.bun/bin:$PATH && bunx tsc -b'
                sh 'export PATH=$HOME/.bun/bin:$PATH && bun test'
                sh 'export PATH=$HOME/.bun/bin:$PATH && bunx vite build'
                stash includes: 'dist/**', name: 'web-dist'
                // Stash source for Windows (can't git-fetch from internal Gitea)
                stash includes: 'package.json,bun.lockb,electron/**,electron-builder.yml,src/**,tsconfig*.json,index.html,vite.config.ts,public/**', name: 'source'
            }
        }

        // ────────────────────────────────────────────────────────
        // Stage 2: All platform builds in parallel
        // ────────────────────────────────────────────────────────
        stage('Package') {
            parallel {
                // ── Electron: Linux ─────────────────────────────
                stage('Electron Linux') {
                    agent { label 'linux' }
                    steps {
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                        unstash 'web-dist'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bunx tsc -p electron/tsconfig.json'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bunx electron-builder --config electron-builder.yml --linux --x64'
                    }
                    post {
                        success {
                            stash includes: 'release/*.AppImage,release/*.deb', name: 'electron-linux', allowEmpty: true
                            archiveArtifacts artifacts: 'release/*.AppImage,release/*.deb', fingerprint: true
                        }
                    }
                }

                // ── Web Server: all platforms (cross-compile from Linux) ──
                stage('Web Server Binaries') {
                    agent { label 'linux' }
                    steps {
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                        unstash 'web-dist'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun server/bundle-dist.ts'
                        sh 'mkdir -p release'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun build server/main.ts --compile --target=bun-linux-x64 --outfile release/crossdraw-server-linux-x64'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun build server/main.ts --compile --target=bun-linux-arm64 --outfile release/crossdraw-server-linux-arm64'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun build server/main.ts --compile --target=bun-darwin-x64 --outfile release/crossdraw-server-darwin-x64'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun build server/main.ts --compile --target=bun-darwin-arm64 --outfile release/crossdraw-server-darwin-arm64'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun build server/main.ts --compile --target=bun-windows-x64 --outfile release/crossdraw-server-windows-x64.exe'
                    }
                    post {
                        success {
                            stash includes: 'release/crossdraw-server-*', name: 'server-binaries'
                            archiveArtifacts artifacts: 'release/crossdraw-server-*', fingerprint: true
                        }
                    }
                }

                // ── Electron: macOS (unsigned) ─────────────────
                stage('Electron macOS') {
                    agent { label 'macos' }
                    steps {
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                        unstash 'web-dist'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bunx tsc -p electron/tsconfig.json'
                        sh 'export PATH=$HOME/.bun/bin:$PATH && CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --config electron-builder.yml --mac --arm64'
                    }
                    post {
                        success {
                            stash includes: 'release/*.dmg,release/*.zip', name: 'electron-macos', allowEmpty: true
                            archiveArtifacts artifacts: 'release/*.dmg,release/*.zip', fingerprint: true
                        }
                    }
                }

                // ── Electron: Windows ─────────────────────────
                stage('Electron Windows') {
                    agent { label 'windows' }
                    options {
                        skipDefaultCheckout()
                    }
                    steps {
                        unstash 'source'
                        unstash 'web-dist'
                        bat 'bun install --frozen-lockfile'
                        bat 'bunx tsc -p electron/tsconfig.json'
                        bat 'bunx electron-builder --config electron-builder.yml --win --x64 --arm64'
                    }
                    post {
                        success {
                            stash includes: 'release/*.exe,release/*.msi', name: 'electron-windows', allowEmpty: true
                            archiveArtifacts artifacts: 'release/*.exe,release/*.msi', fingerprint: true
                        }
                    }
                }

                // ── Mobile: Android (debug APK, unsigned) ───────
                stage('Android') {
                    agent { label 'linux' }
                    environment {
                        ANDROID_HOME = "${HOME}/Android/Sdk"
                    }
                    steps {
                        sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                        unstash 'web-dist'
                        // Capacitor CLI requires Node 22+
                        sh '''
                            export PATH=$HOME/.bun/bin:$PATH
                            export NVM_DIR="$HOME/.nvm"
                            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                            nvm use 22
                            bunx cap sync android
                        '''
                        dir('android') {
                            sh './gradlew assembleDebug'
                        }
                        sh 'mkdir -p release && cp android/app/build/outputs/apk/debug/app-debug.apk release/crossdraw.apk'
                    }
                    post {
                        success {
                            stash includes: 'release/crossdraw.apk', name: 'android-apk', allowEmpty: true
                            archiveArtifacts artifacts: 'release/crossdraw.apk', fingerprint: true
                        }
                    }
                }

                // ── Mobile: iOS ─────────────────────────────────
                // Disabled: App.xcworkspace not yet generated (needs initial pod install)
                // stage('iOS') {
                //     agent { label 'macos' }
                //     steps {
                //         sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                //         unstash 'web-dist'
                //         sh 'export PATH=$HOME/.bun/bin:$PATH && bunx cap sync ios'
                //         dir('ios/App') {
                //             sh 'pod install'
                //             sh '''
                //                 xcodebuild \
                //                     -workspace App.xcworkspace \
                //                     -scheme App \
                //                     -configuration Release \
                //                     -archivePath build/Crossdraw.xcarchive \
                //                     archive \
                //                     CODE_SIGN_IDENTITY="" \
                //                     CODE_SIGNING_REQUIRED=NO \
                //                     CODE_SIGNING_ALLOWED=NO
                //             '''
                //         }
                //     }
                //     post {
                //         success {
                //             archiveArtifacts artifacts: 'ios/App/build/**/*.ipa,ios/App/build/**/*.xcarchive/**', fingerprint: true, allowEmptyArchive: true
                //         }
                //     }
                // }
            }
        }

        // ────────────────────────────────────────────────────────
        // Stage 3: Publish editor-core to npm
        // ────────────────────────────────────────────────────────
        stage('npm Publish') {
            agent { label 'linux' }
            environment {
                NPM_TOKEN = credentials('npm-token')
            }
            steps {
                sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                unstash 'web-dist'
                dir('packages/editor-core') {
                    sh 'export PATH=$HOME/.bun/bin:$PATH && bun run build'
                    sh '''
                        export PATH=$HOME/.bun/bin:$PATH
                        echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
                        PUBLISHED=$(npm view crossdraw version 2>/dev/null || echo "0.0.0")
                        CURRENT=$(node -p "require('./package.json').version")
                        if [ "$PUBLISHED" != "$CURRENT" ]; then
                            npm publish --access public
                            echo "Published crossdraw@${CURRENT}"
                        else
                            echo "crossdraw@${CURRENT} already published, skipping"
                        fi
                        rm -f .npmrc
                    '''
                }
            }
        }

        // ────────────────────────────────────────────────────────
        // Stage 4: Deploy to Beta (always)
        // ────────────────────────────────────────────────────────
        stage('Deploy Beta') {
            agent { label 'linux' }
            environment {
                CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token')
                CLOUDFLARE_ACCOUNT_ID = credentials('cloudflare-account-id')
            }
            steps {
                sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                unstash 'web-dist'
                sh 'mkdir -p release'
                unstash 'server-binaries'
                script {
                    try { unstash 'electron-linux' } catch (e) { echo 'No Electron Linux artifacts' }
                    try { unstash 'electron-macos' } catch (e) { echo 'No Electron macOS artifacts' }
                    try { unstash 'electron-windows' } catch (e) { echo 'No Electron Windows artifacts' }
                    try { unstash 'android-apk' } catch (e) { echo 'No Android APK' }
                }
                // Deploy Worker + static assets to beta.crossdraw.app
                sh '''
                    export PATH=$HOME/.bun/bin:$PATH
                    export NVM_DIR="$HOME/.nvm"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    if ! nvm ls 20 > /dev/null 2>&1; then nvm install 20; fi
                    nvm use 20
                    bunx wrangler deploy --env beta
                '''
                // Upload release binaries to R2
                sh '''
                    export PATH=$HOME/.bun/bin:$PATH
                    export NVM_DIR="$HOME/.nvm"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use 20 2>/dev/null || true
                    for f in release/*; do
                        [ -f "$f" ] && bunx wrangler r2 object put "crossdraw-releases/$(basename $f)" --file="$f" --remote || true
                    done
                '''
            }
        }

        // ────────────────────────────────────────────────────────
        // Stage 5: Bake on beta, then promote to production
        // ────────────────────────────────────────────────────────
        stage('Deploy Production') {
            agent { label 'linux' }
            environment {
                CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token')
                CLOUDFLARE_ACCOUNT_ID = credentials('cloudflare-account-id')
            }
            steps {
                sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                unstash 'web-dist'

                // Canary checks against beta for 10 minutes — must pass to proceed
                echo 'Running canary checks against beta.crossdraw.app...'
                sh 'export PATH=$HOME/.bun/bin:$PATH && bun scripts/canary.ts https://beta.crossdraw.app --interval 30 --duration 600'

                // Canary passed — promote to production
                sh '''
                    export PATH=$HOME/.bun/bin:$PATH
                    export NVM_DIR="$HOME/.nvm"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use 20 2>/dev/null || true
                    bunx wrangler deploy --env production
                '''

                // Smoke test production
                echo 'Running smoke test against crossdraw.app...'
                sh 'export PATH=$HOME/.bun/bin:$PATH && bun scripts/canary.ts https://crossdraw.app --once'
            }
        }
    }

    post {
        success {
            node('linux') {
                echo "Build ${BUILD_NUMBER} succeeded — all artifacts archived."
            }
        }
        failure {
            node('linux') {
                echo "Build ${BUILD_NUMBER} failed."
            }
        }
    }
}
