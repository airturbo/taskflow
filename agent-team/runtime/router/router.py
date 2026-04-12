"""
Agent Team Router Executor — Phase 1 Prototype

职责：
1. 接收用户输入（自然语言请求）
2. 意图分类：readonly_query / explicit_change / ambiguous
3. 根据意图和关键词匹配主责角色
4. 分发请求到目标角色并返回路由结果

依赖配置：
- configs/global/router-config.v1.yaml
- roles/*/role.profile.json
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

import yaml  # pip install pyyaml


# ---------------------------------------------------------------------------
# 枚举与数据类
# ---------------------------------------------------------------------------

class Intent(Enum):
    READONLY_QUERY = "readonly_query"
    EXPLICIT_CHANGE = "explicit_change"
    AMBIGUOUS = "ambiguous"


@dataclass
class RouteResult:
    intent: Intent
    target_role: str
    mode: str  # "readonly" | "change" | "intent_confirmation"
    matched_keywords: list[str] = field(default_factory=list)
    message: str = ""


@dataclass
class RoleProfile:
    role_id: str
    display_name: str
    primary_stages: list[str]
    owned_artifacts: list[str]
    keywords: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Router 主类
# ---------------------------------------------------------------------------

class Router:
    """基于配置驱动的路由器。从 YAML + JSON 加载规则，不硬编码角色逻辑。"""

    def __init__(self, project_root: str | Path):
        self.project_root = Path(project_root)
        self.router_config: dict = {}
        self.roles: dict[str, RoleProfile] = {}
        self.readonly_keywords: list[str] = []
        self.change_keywords: list[str] = []
        self.ambiguous_policy: str = "route_to_project_manager_for_intent_confirmation"
        self.fallback_owner: str = "project_manager_orchestrator"
        self._load_config()
        self._load_roles()

    # ---- 加载配置 ----

    def _load_config(self) -> None:
        config_path = self.project_root / "configs" / "global" / "router-config.v1.yaml"
        if not config_path.exists():
            raise FileNotFoundError(f"Router config not found: {config_path}")
        with open(config_path, "r", encoding="utf-8") as f:
            self.router_config = yaml.safe_load(f)

        intent_cfg = self.router_config.get("intent_classifier", {})
        self.readonly_keywords = intent_cfg.get("readonly_keywords", [])
        self.change_keywords = intent_cfg.get("change_keywords", [])
        self.ambiguous_policy = intent_cfg.get(
            "ambiguous_policy",
            "route_to_project_manager_for_intent_confirmation",
        )
        self.fallback_owner = self.router_config.get("defaults", {}).get(
            "fallback_owner", "project_manager_orchestrator"
        )

    def _load_roles(self) -> None:
        roles_dir = self.project_root / "roles"
        if not roles_dir.exists():
            raise FileNotFoundError(f"Roles directory not found: {roles_dir}")
        for role_dir in sorted(roles_dir.iterdir()):
            profile_path = role_dir / "role.profile.json"
            if not profile_path.exists():
                continue
            with open(profile_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            rp = RoleProfile(
                role_id=data["role_id"],
                display_name=data.get("display_name", data["role_id"]),
                primary_stages=data.get("primary_stages", []),
                owned_artifacts=data.get("owned_artifacts", []),
            )
            # 从 display_name 和 owned_artifacts 提取关键词用于粗匹配
            rp.keywords = self._extract_role_keywords(rp)
            self.roles[rp.role_id] = rp

    @staticmethod
    def _extract_role_keywords(rp: RoleProfile) -> list[str]:
        """从角色元数据中提取粗匹配关键词。"""
        keywords: list[str] = []
        # display_name 中的中文词
        keywords.append(rp.display_name)
        # owned_artifacts 的类型名
        for art in rp.owned_artifacts:
            keywords.append(art.lower().replace("_", " "))
        # 常用别名映射（可扩展）
        alias_map = {
            "project_manager_orchestrator": ["项目经理", "orchestrator", "PM", "排期", "进度", "阻塞"],
            "product_manager": ["产品经理", "需求", "PRD", "用户故事", "功能"],
            "ui_ux_designer": ["UI", "UX", "设计", "交互", "原型", "视觉"],
            "user_experience_officer": ["体验官", "体验评审", "体验验收", "用户体验", "挑刺", "审美", "极致体验", "复审"],
            "system_architect": ["架构", "技术方案", "选型", "高可用", "容灾"],
            "frontend_engineer": ["前端", "React", "Vue", "CSS", "页面", "组件"],
            "backend_engineer": ["后端", "API", "数据库", "服务端", "接口"],
            "qa_engineer": ["测试", "QA", "用例", "回归", "缺陷", "Bug"],
            "devops_engineer": ["运维", "DevOps", "部署", "CI/CD", "监控", "流水线"],
            "data_analyst": ["数据", "分析", "埋点", "报表", "指标", "数据分析"],
            "security_compliance_engineer": ["安全", "合规", "隐私", "审计", "风控", "安全审查"],
        }
        keywords.extend(alias_map.get(rp.role_id, []))
        return keywords

    # ---- 意图分类 ----

    def classify_intent(self, user_input: str) -> tuple[Intent, list[str]]:
        """
        对用户输入做意图分类。
        返回 (Intent, matched_keywords)
        """
        text = user_input.lower()
        readonly_hits = [kw for kw in self.readonly_keywords if kw in text]
        change_hits = [kw for kw in self.change_keywords if kw in text]

        if change_hits and not readonly_hits:
            return Intent.EXPLICIT_CHANGE, change_hits
        if readonly_hits and not change_hits:
            return Intent.READONLY_QUERY, readonly_hits
        if change_hits and readonly_hits:
            # 冲突时倾向于变更，但标注为 ambiguous
            return Intent.AMBIGUOUS, readonly_hits + change_hits
        # 都没命中
        return Intent.AMBIGUOUS, []

    # ---- 角色匹配 ----

    def match_role(self, user_input: str) -> str:
        """
        从输入中匹配最相关的角色。
        返回 role_id；匹配不到时返回 fallback_owner。
        """
        text = user_input.lower()
        best_role = self.fallback_owner
        best_score = 0
        for role_id, rp in self.roles.items():
            score = 0
            for kw in rp.keywords:
                if kw.lower() in text:
                    score += 1
            if score > best_score:
                best_score = score
                best_role = role_id
        return best_role

    # ---- 路由主入口 ----

    def route(self, user_input: str) -> RouteResult:
        """
        路由主入口。
        1. 意图分类
        2. 角色匹配
        3. 构建 RouteResult
        """
        intent, matched_kw = self.classify_intent(user_input)
        target_role = self.match_role(user_input)

        if intent == Intent.READONLY_QUERY:
            return RouteResult(
                intent=intent,
                target_role=target_role,
                mode="readonly",
                matched_keywords=matched_kw,
                message=f"[只读查询] 路由到 {self.roles.get(target_role, target_role)}",
            )
        elif intent == Intent.EXPLICIT_CHANGE:
            return RouteResult(
                intent=intent,
                target_role=target_role,
                mode="change",
                matched_keywords=matched_kw,
                message=f"[正式变更] 路由到 {self.roles.get(target_role, target_role)}，需先完成影响评估",
            )
        else:
            # ambiguous → 先交给 Orchestrator 确认意图
            return RouteResult(
                intent=intent,
                target_role=self.fallback_owner,
                mode="intent_confirmation",
                matched_keywords=matched_kw,
                message=f"[意图模糊] 先交给 Orchestrator ({self.fallback_owner}) 确认意图",
            )


# ---------------------------------------------------------------------------
# CLI 入口（调试用）
# ---------------------------------------------------------------------------

def main():
    import sys

    project_root = os.environ.get("AGENT_TEAM_ROOT", ".")
    router = Router(project_root)

    print("=" * 60)
    print("Agent Team Router — Phase 1 Prototype")
    print(f"已加载 {len(router.roles)} 个角色")
    print(f"只读关键词: {router.readonly_keywords}")
    print(f"变更关键词: {router.change_keywords}")
    print("=" * 60)

    if len(sys.argv) > 1:
        user_input = " ".join(sys.argv[1:])
    else:
        user_input = input("\n请输入请求 > ")

    result = router.route(user_input)
    print(f"\n{'─' * 40}")
    print(f"意图:       {result.intent.value}")
    print(f"目标角色:   {result.target_role}")
    print(f"模式:       {result.mode}")
    print(f"匹配关键词: {result.matched_keywords}")
    print(f"消息:       {result.message}")


if __name__ == "__main__":
    main()
