import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { SkillMetadata } from "@argos/shared/types/skill";
import { createSkillClient } from "#api/SkillClient";
import { skillsStore, loadSkills } from "#/stores/skillsStore";
import { useStore } from "@tanstack/react-store";

export function useSkillsData(conversationId: string | null) {
  const skillClient = useMemo(() => createSkillClient(), []);
  const storeSkills = useStore(skillsStore, (s) => s.skills);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const [pendingSkills, setPendingSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const conversationIdRef = useRef(conversationId);
  const activeSkillsRef = useRef(activeSkills);
  useEffect(() => {
    conversationIdRef.current = conversationId;
    activeSkillsRef.current = activeSkills;
  }, [conversationId, activeSkills]);

  const skills = useMemo<SkillMetadata[]>(() => storeSkills, [storeSkills]);

  const effectiveActiveSkills = conversationId ? activeSkills : pendingSkills;

  const activeCount = effectiveActiveSkills.length;

  const activeSkillItems = useMemo(() => {
    const activeSet = new Set(effectiveActiveSkills);
    return skills.filter((skill) => activeSet.has(skill.name));
  }, [effectiveActiveSkills, skills]);

  const availableSkills = useMemo(() => {
    const activeSet = new Set(effectiveActiveSkills);
    return skills.filter((skill) => !activeSet.has(skill.name));
  }, [effectiveActiveSkills, skills]);

  const loadActiveSkills = useCallback(
    async (idOverride?: string | null) => {
      const id = idOverride ?? conversationIdRef.current;
      if (!id) {
        setActiveSkills([]);
        return;
      }

      setLoading(true);
      try {
        const result = await skillClient.getActiveSkills(id);
        setActiveSkills(result);
      } catch (error) {
        console.error("[useSkillsData] Failed to load active skills:", error);
        setActiveSkills([]);
      }
      setLoading(false);
    },
    [skillClient],
  );

  const toggleSkill = useCallback(
    async (skillName: string) => {
      if (!conversationIdRef.current) {
        setPendingSkills((prev) =>
          prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName],
        );
        return;
      }

      const current = activeSkillsRef.current;
      const isCurrentlyActive = current.includes(skillName);
      const updatedSkills = isCurrentlyActive ? current.filter((s) => s !== skillName) : [...current, skillName];

      try {
        await skillClient.setActiveSkills(conversationIdRef.current, updatedSkills);
        setActiveSkills(updatedSkills);
      } catch (error) {
        console.error("[useSkillsData] Failed to toggle skill:", error);
      }
    },
    [skillClient],
  );

  const activateSkill = useCallback(
    async (skillName: string) => {
      if (!conversationIdRef.current) {
        setPendingSkills((prev) => (prev.includes(skillName) ? prev : [...prev, skillName]));
        return;
      }

      const current = activeSkillsRef.current;
      if (current.includes(skillName)) return;

      const updatedSkills = [...current, skillName];
      try {
        await skillClient.setActiveSkills(conversationIdRef.current, updatedSkills);
        setActiveSkills(updatedSkills);
      } catch (error) {
        console.error("[useSkillsData] Failed to activate skill:", error);
      }
    },
    [skillClient],
  );

  const deactivateSkill = useCallback(
    async (skillName: string) => {
      if (!conversationIdRef.current) {
        setPendingSkills((prev) => prev.filter((s) => s !== skillName));
        return;
      }

      const current = activeSkillsRef.current;
      if (!current.includes(skillName)) return;

      const updatedSkills = current.filter((s) => s !== skillName);
      try {
        await skillClient.setActiveSkills(conversationIdRef.current, updatedSkills);
        setActiveSkills(updatedSkills);
      } catch (error) {
        console.error("[useSkillsData] Failed to deactivate skill:", error);
      }
    },
    [skillClient],
  );

  const consumePendingSkills = useCallback(() => {
    const pending = [...pendingSkills];
    setPendingSkills([]);
    return pending;
  }, [pendingSkills]);

  const applyPendingSkillsToConversation = useCallback(
    async (newConversationId: string) => {
      const pending = [...pendingSkills];
      setPendingSkills([]);
      if (pending.length > 0) {
        try {
          await skillClient.setActiveSkills(newConversationId, pending);
        } catch (error) {
          console.error("[useSkillsData] Failed to apply pending skills:", error);
        }
      }
    },
    [pendingSkills, skillClient],
  );

  useEffect(() => {
    void loadActiveSkills(conversationId);
  }, [conversationId, loadActiveSkills]);

  useEffect(() => {
    const handleSkillSessionChanged = (payload: {
      conversationId: string;
      skills: string[];
      change: "activated" | "deactivated";
    }) => {
      if (payload.conversationId === conversationIdRef.current && Array.isArray(payload.skills)) {
        if (payload.change === "activated") {
          const currentSet = new Set(activeSkillsRef.current);
          payload.skills.forEach((skill: string) => currentSet.add(skill));
          setActiveSkills(Array.from(currentSet));
          return;
        }

        const deactivatedSet = new Set(payload.skills);
        setActiveSkills((prev) => prev.filter((s) => !deactivatedSet.has(s)));
      }
    };

    if (skillsStore.state.skills.length === 0) {
      loadSkills();
    }

    unsubscribeRef.current = skillClient.onSessionChanged(handleSkillSessionChanged);

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [skillClient]);

  return {
    skills,
    activeSkills: effectiveActiveSkills,
    activeCount,
    activeSkillItems,
    availableSkills,
    loading,
    pendingSkills,
    loadActiveSkills,
    toggleSkill,
    activateSkill,
    deactivateSkill,
    consumePendingSkills,
    applyPendingSkillsToConversation,
  };
}
