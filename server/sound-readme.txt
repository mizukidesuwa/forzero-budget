FORZERO: BUDGET（有限竞速：零预算）自定义音效目录说明

默认留空即保持静音，零额外加载开销。
如需自定义音效，只需将对应名称的音频文件（支持 .mp3 / .wav / .ogg / .m4a / .webm）放入本目录，然后刷新游戏即可生效：

  countdown.mp3   倒计时 3 / 2 / 1 提示音
  go.mp3          倒计时结束发车提示音
  checkpoint.mp3  通过检查点提示音
  finish.mp3      完赛冲线提示音
  bell.mp3        骑行中按 B 或 H 键触发的车铃声
  rejoin.mp3      按 F 键回到赛道提示音

注意：通过「启动游戏.bat」或 server.mjs 运行时会自动扫描本目录并加载已放入的文件；未放入对应文件则自动静音跳过。
