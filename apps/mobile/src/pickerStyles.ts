import type { PickerStyle } from "react-native-picker-select";

export const pickerSelectStyle: PickerStyle = {
  inputIOS: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#dfe7df",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 10,
    paddingRight: 36,
    color: "#273a2e",
    backgroundColor: "#fff"
  },
  inputAndroid: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#dfe7df",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 10,
    paddingRight: 36,
    color: "#273a2e",
    backgroundColor: "#fff",
    textAlignVertical: "center"
  },
  inputWeb: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#dfe7df",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 10,
    paddingRight: 36,
    color: "#273a2e",
    backgroundColor: "#fff"
  },
  placeholder: { color: "#89928b" },
  iconContainer: { top: 11, right: 12 }
};
