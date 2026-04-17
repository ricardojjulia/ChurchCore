"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { AlertTriangle, ShieldAlert, ShieldCheck, UserPlus } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { ccmNavItems } from "@/components/application/ccm-nav";
import { updateChildProfileAction, upsertAuthorizedPickupAction } from "@/app/app/ccm-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  Allergy,
  AllergySeverity,
  CcmChildProfile,
  PickupRelationship,
} from "@/lib/ccm-types";

// ── Child directory (list) ────────────────────────────────────────────────────

export function CcmChildDirectory({
  session,
  people,
}: {
  session: ChurchAppSession;
  people: Array<{ id: string; fullName: string; status?: string }>;
}) {
  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? people.filter((p) => p.fullName.toLowerCase().includes(search.toLowerCase()))
    : people;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Child Directory"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Children's Ministry"
      sidebarDescription="Child profiles & PII"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/children")}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <TextInput
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, maxWidth: 360 }}
          />
          <Button
            component={Link}
            href="/app/church-admin/children/children/new"
            leftSection={<UserPlus size={14} />}
            color="churchBlue"
          >
            Register Child
          </Button>
        </Group>
        <Paper withBorder radius="md" p="md">
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td><Text fw={500}>{p.fullName}</Text></Table.Td>
                  <Table.Td>
                    <Badge size="xs" color={p.status === "active" ? "teal" : "gray"}>
                      {p.status ?? "active"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      component={Link}
                      href={`/app/church-admin/children/children/${p.id}`}
                      size="xs"
                      variant="light"
                    >
                      View Profile
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
              {filtered.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text size="sm" c="dimmed">No children found.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>
    </ApplicationShell>
  );
}

// ── Child profile detail ──────────────────────────────────────────────────────

function AllergyEditor({
  allergies,
  onChange,
}: {
  allergies: Allergy[];
  onChange: (a: Allergy[]) => void;
}) {
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState<AllergySeverity>("moderate");

  const add = () => {
    if (!name.trim()) return;
    onChange([...allergies, { name: name.trim(), severity }]);
    setName("");
  };

  return (
    <Stack gap="xs">
      {allergies.map((a, i) => (
        <Group key={i} gap="xs">
          <Badge
            color={a.severity === "anaphylactic" ? "red" : a.severity === "moderate" ? "orange" : "yellow"}
            variant="filled"
            size="sm"
          >
            {a.name} — {a.severity}
          </Badge>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            onClick={() => onChange(allergies.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </Group>
      ))}
      <Group gap="xs" align="flex-end">
        <TextInput
          placeholder="Allergy name (e.g. Peanuts)"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          data={[
            { value: "anaphylactic", label: "Anaphylactic" },
            { value: "moderate", label: "Moderate" },
            { value: "mild", label: "Mild" },
          ]}
          value={severity}
          onChange={(v) => setSeverity((v as AllergySeverity) ?? "moderate")}
          style={{ width: 160 }}
        />
        <Button size="sm" variant="light" onClick={add}>Add</Button>
      </Group>
    </Stack>
  );
}

export function CcmChildProfileView({
  session,
  profile,
}: {
  session: ChurchAppSession;
  profile: CcmChildProfile;
}) {
  const [allergies, setAllergies] = useState<Allergy[]>(profile.allergies);
  const [noPhoto, setNoPhoto] = useState(profile.noPhotoFlag);
  const [specialNeeds, setSpecialNeeds] = useState(profile.specialNeedsNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    startTransition(async () => {
      await updateChildProfileAction({
        childProfileId: profile.profileId,
        allergies,
        noPhotoFlag: noPhoto,
        specialNeedsNotes: specialNeeds || undefined,
      });
      setSaved(true);
    });
  };

  const [newPickupName, setNewPickupName] = useState("");
  const [newPickupRel, setNewPickupRel] = useState<PickupRelationship>("parent");
  const [addingPickup, startPickupTransition] = useTransition();

  const handleAddPickup = () => {
    if (!newPickupName.trim()) return;
    startPickupTransition(async () => {
      await upsertAuthorizedPickupAction({
        childProfileId: profile.profileId,
        authorizedName: newPickupName.trim(),
        relationship: newPickupRel,
      });
      setNewPickupName("");
    });
  };

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title={profile.childName}
      description="Child Profile"
      sidebarTitle="Children's Ministry"
      sidebarDescription="Child profiles & PII"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/children")}
    >
      <Stack gap="lg">
        {/* Custody restrictions — ADMIN ONLY, highest visual priority */}
        {profile.custodyRestrictions.length > 0 && (
          <Alert
            color="red"
            icon={<ShieldAlert size={20} />}
            title="⛔ CUSTODY RESTRICTION ON FILE"
            styles={{ root: { border: "2px solid #c92a2a" } }}
          >
            <Stack gap="xs">
              {profile.custodyRestrictions.map((r) => (
                <Text key={r.id} size="sm" fw={600}>
                  {r.restrictedName}
                  {r.relationship ? ` (${r.relationship})` : ""}
                  {r.courtOrderOnFile ? " — COURT ORDER ON FILE" : ""}
                </Text>
              ))}
            </Stack>
            <Text size="xs" mt="xs">
              This individual must NOT be allowed to pick up this child under any circumstances.
              Contact your Children&apos;s Ministry Admin if you need to override.
            </Text>
          </Alert>
        )}

        {/* No-photo flag */}
        {noPhoto && (
          <Alert color="red" icon={<ShieldAlert size={16} />}>
            NO PHOTOS — This family has requested no photographs of this child be taken.
          </Alert>
        )}

        {/* Sensitive data editor */}
        <Paper withBorder p="md" radius="md">
          <Group mb="sm">
            <ThemeIcon color="blue" variant="light" size="lg" radius="md">
              <ShieldCheck size={18} />
            </ThemeIcon>
            <Title order={5}>Safety & Medical Information</Title>
          </Group>

          {saved && (
            <Alert color="teal" mb="sm" icon={<ShieldCheck size={14} />}>
              Profile saved successfully.
            </Alert>
          )}

          <Stack gap="sm">
            <Group gap="sm" align="center">
              <input
                type="checkbox"
                id="no-photo"
                checked={noPhoto}
                onChange={(e) => setNoPhoto(e.currentTarget.checked)}
              />
              <label htmlFor="no-photo">
                <Text size="sm" fw={500}>No-Photo Flag</Text>
                <Text size="xs" c="dimmed">
                  Prevents photos being taken or shared. Appears on badge in red.
                </Text>
              </label>
            </Group>

            <div>
              <Text size="sm" fw={500} mb={4}>Allergies</Text>
              <AllergyEditor allergies={allergies} onChange={setAllergies} />
            </div>

            <TextInput
              label="Special Needs Notes"
              placeholder="Behavioral notes, sensory needs, accommodations… (encrypted at rest)"
              value={specialNeeds}
              onChange={(e) => setSpecialNeeds(e.currentTarget.value)}
              description="Visible to lead teacher and admin only."
            />

            <Button
              onClick={handleSave}
              loading={isPending}
              color="churchBlue"
              style={{ alignSelf: "flex-start" }}
            >
              Save
            </Button>
          </Stack>
        </Paper>

        {/* Authorized pickups */}
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="sm">Authorized Pick-Ups</Title>
          <Table striped mb="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Relationship</Table.Th>
                <Table.Th>ID Verified</Table.Th>
                <Table.Th>Primary</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {profile.authorizedPickups.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td><Text fw={500}>{p.authorizedName}</Text></Table.Td>
                  <Table.Td>{p.relationship.replace("_", " ")}</Table.Td>
                  <Table.Td>
                    <Badge color={p.idVerified ? "teal" : "gray"} size="xs">
                      {p.idVerified ? "Verified" : "Unverified"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {p.isPrimary && <Badge color="churchBlue" size="xs">Primary</Badge>}
                  </Table.Td>
                </Table.Tr>
              ))}
              {profile.authorizedPickups.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text size="sm" c="dimmed">No authorized pickups on file.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>

          {/* Add pickup form */}
          <Group gap="xs" align="flex-end">
            <TextInput
              placeholder="Full name"
              value={newPickupName}
              onChange={(e) => setNewPickupName(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              data={[
                { value: "parent", label: "Parent" },
                { value: "grandparent", label: "Grandparent" },
                { value: "sibling", label: "Sibling" },
                { value: "aunt_uncle", label: "Aunt/Uncle" },
                { value: "family_friend", label: "Family Friend" },
                { value: "caregiver", label: "Caregiver" },
                { value: "other", label: "Other" },
              ]}
              value={newPickupRel}
              onChange={(v) => setNewPickupRel((v as PickupRelationship) ?? "parent")}
              style={{ width: 160 }}
            />
            <Button
              size="sm"
              variant="light"
              loading={addingPickup}
              onClick={handleAddPickup}
            >
              Add
            </Button>
          </Group>
        </Paper>

        {/* Background check status */}
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="xs">Background Check</Title>
          {profile.clearanceDate ? (
            <Group gap="xs">
              <Badge color="teal" size="sm">Cleared</Badge>
              <Text size="sm" c="dimmed">Clearance date: {profile.clearanceDate}</Text>
            </Group>
          ) : (
            <Alert color="orange" icon={<AlertTriangle size={14} />}>
              No background clearance date on file for this profile.
            </Alert>
          )}
        </Paper>
      </Stack>
    </ApplicationShell>
  );
}

// ── New child registration (first-time visitor flow) ─────────────────────────

export function CcmNewChildForm({ session }: { session: ChurchAppSession }) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Register New Child"
      description="First-time visitor"
      sidebarTitle="Children's Ministry"
      sidebarDescription="Child profiles & PII"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/children")}
    >
      <Paper withBorder p="lg" radius="md" style={{ maxWidth: 480 }}>
        <Title order={4} mb="md">First-Time Registration</Title>
        <Text size="sm" c="dimmed" mb="md">
          Create a minimal profile for a new child so they can be checked in today.
          Full profile details (allergies, authorized pickups, medical notes) can be
          completed after the service.
        </Text>
        <Stack gap="sm">
          <TextInput label="Child&apos;s Full Name" placeholder="First and last name" required />
          <TextInput label="Guardian Name" placeholder="Parent / guardian present today" />
          <TextInput label="Guardian Phone" placeholder="For service notifications" />
          <TextInput label="Date of Birth" placeholder="YYYY-MM-DD" />
          <Button color="churchBlue" mt="sm">Create Profile & Check In</Button>
        </Stack>
      </Paper>
    </ApplicationShell>
  );
}
