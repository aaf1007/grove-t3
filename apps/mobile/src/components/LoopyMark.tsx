import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

export function LoopyMark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  return (
    <Svg accessible={false} height={props.height} width={props.height} viewBox="17 14 97 97">
      <ThemedPath
        d="M36 22h17c6 0 11 5 11 11v35L37 95a19 19 0 0 1-12-18V33c0-6 5-11 11-11Z M43 103l30-30h22c6 0 11 5 11 11v8c0 6-5 11-11 11H43Z"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
