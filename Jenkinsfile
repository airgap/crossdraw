// Triggered via Gitea push webhook → generic-webhook-trigger (token: crossdraw-webhook)

pipeline {
    agent none

    triggers {
        GenericTrigger(
            genericVariables: [
                [key: 'ref', value: '$.ref']
            ],
            token: 'crossdraw-webhook',
            causeString: 'Push to $ref',
            printContributedVariables: true,
            printPostContent: false,
            regexpFilterText: '$ref',
            regexpFilterExpression: '^refs/heads/(main|release/.*)$'
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
                            archiveArtifacts artifacts: 'release/*.dmg,release/*.zip', fingerprint: true
                        }
                    }
                }

                // ── Electron: Windows ─────────────────────────
                // Disabled: windows-strix cannot reach git@t.muzz.in (SSH timeout)
                // Uncomment when Windows node has network access to Gitea
                // stage('Electron Windows') {
                //     agent { label 'windows' }
                //     steps {
                //         bat 'bun install --frozen-lockfile'
                //         unstash 'web-dist'
                //         bat 'bunx tsc -p electron/tsconfig.json'
                //         bat 'bunx electron-builder --config electron-builder.yml --win --x64 --arm64'
                //     }
                //     post {
                //         success {
                //             archiveArtifacts artifacts: 'release/*.exe,release/*.msi', fingerprint: true
                //         }
                //     }
                // }

                // ── Mobile: Android ─────────────────────────────
                // Disabled: credentials (android-keystore etc.) not yet configured
                // stage('Android') {
                //     agent { label 'linux' }
                //     environment {
                //         ANDROID_HOME = "${HOME}/Android/Sdk"
                //         ANDROID_KEYSTORE = credentials('android-keystore')
                //         ANDROID_KEYSTORE_PASSWORD = credentials('android-keystore-password')
                //         ANDROID_KEY_ALIAS = credentials('android-key-alias')
                //         ANDROID_KEY_PASSWORD = credentials('android-key-password')
                //     }
                //     steps {
                //         sh 'export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile'
                //         unstash 'web-dist'
                //         sh 'export PATH=$HOME/.bun/bin:$PATH && bunx cap sync android'
                //         dir('android') {
                //             sh './gradlew assembleRelease'
                //         }
                //     }
                //     post {
                //         success {
                //             archiveArtifacts artifacts: 'android/app/build/outputs/apk/release/*.apk', fingerprint: true
                //         }
                //     }
                // }

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
