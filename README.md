# osu!GD

本项目为 [SayamaKaede/osu-gd](https://github.com/SayamaKaede/osu-gd) 的分支（fork），原作者为 Sayama Kaede。

本项目与 osu! 和 ppy 无关。如有问题，请勿联系 osu! 官方。

这是一个 Tampermonkey 脚本，用于在 osu! 个人资料页面上显示该用户的 Pending、Graveyard 分类下的客串难度谱面。

osu! 只会显示带有排行榜的类别（Ranked、Approved、Qualified、Loved）中的客串难度列表。位于 Pending 或 Graveyard 中的谱面难度在任何地方都不会显示。本脚本会获取这些难度，并在个人资料中作为两个栏目显示。

本分支的新增内容为：
- 增加了中文翻译，允许在中文、英文、日文之间切换。
- 将谱面的卡片替换为允许按照谱面列表的设置切换大小。

本分支仅供我私下个人娱乐使用，因此不会更新或提交合并。

## 安装

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/)
2. **打开 [osu-gd.user.js](https://raw.githubusercontent.com/flower-iroseka/osu-gd/main/osu-gd.user.js)**

打开第 2 步的链接后，会显示 Tampermonkey 的安装界面。

支持自动更新。

## 许可证

MIT。详见 [LICENSE](LICENSE)。
