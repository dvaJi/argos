export type ChannelKey = "telegram" | "qqbot" | "discord" | "weixin";

export type ChannelMeta = {
  key: ChannelKey;
  label: string;
  icon: string;
  /** Official brand color (simple-icons) used when the channel is configured/enabled. */
  brandColor: string;
  description: string;
};

export const CHANNELS: ChannelMeta[] = [
  {
    key: "telegram",
    label: "Telegram",
    icon: "simple-icons:telegram",
    brandColor: "#26A5E4",
    description: "Pair your account and control Argos from Telegram.",
  },
  {
    key: "qqbot",
    label: "QQ Bot",
    icon: "simple-icons:tencentqq",
    brandColor: "#EB1923",
    description: "Connect a QQ bot to chat with Argos.",
  },
  {
    key: "discord",
    label: "Discord",
    icon: "simple-icons:discord",
    brandColor: "#5865F2",
    description: "Bring Argos into your Discord server.",
  },
  {
    key: "weixin",
    label: "WeChat",
    icon: "simple-icons:wechat",
    brandColor: "#07C160",
    description: "Reach Argos from WeChat.",
  },
];

export function getChannel(key: ChannelKey): ChannelMeta {
  return CHANNELS.find((channel) => channel.key === key) ?? CHANNELS[0];
}
