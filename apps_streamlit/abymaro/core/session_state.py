from __future__ import annotations

from copy import deepcopy

import pandas as pd
import streamlit as st


class SessionStateManager:
    """Quản lý session_state để app gọn hơn và dễ mở rộng."""

    def __init__(self, defaults: dict[str, object]) -> None:
        self.defaults = defaults

    def ensure(self) -> None:
        for key, default_value in self.defaults.items():
            if key not in st.session_state:
                st.session_state[key] = self._clone(default_value)

    def reset(self) -> None:
        for key, default_value in self.defaults.items():
            st.session_state[key] = self._clone(default_value)

    @staticmethod
    def _clone(value: object) -> object:
        if isinstance(value, pd.DataFrame):
            return value.copy()
        if value is None:
            return pd.DataFrame()
        if isinstance(value, (dict, list, set)):
            return deepcopy(value)
        return value
